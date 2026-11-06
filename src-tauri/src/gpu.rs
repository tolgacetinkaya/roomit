//! Read-only GPU engine sampling. Missing counters are never interpreted as idle.
use serde::Serialize;
use std::collections::{HashMap, HashSet};

#[cfg(windows)] mod windows;
#[cfg(windows)] pub(crate) use windows::Collector;
#[cfg(not(windows))]
#[derive(Default)]
pub(crate) struct Collector;
#[cfg(not(windows))]
impl Collector {
    pub fn sample(&mut self) -> Frame {
        Frame::unavailable(Status::Unsupported, "Bu platformda süreç bazlı GPU ölçümü bu sürümde desteklenmiyor.")
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all="camelCase")]
pub(crate) enum Status {
    Measured, Partial, WarmingUp, NoCounter, Unavailable,
    #[cfg_attr(windows,allow(dead_code))] // Used by the non-Windows platform provider.
    Unsupported, NoProcess,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all="camelCase")]
pub(crate) struct Reading {
    pub percent: Option<f64>, pub status: Status, pub reason: String,
    pub measured_processes: usize, pub total_processes: usize,
}
#[derive(Clone, Debug)]
pub(crate) struct EngineSample { pub pid: u32, pub engine: String, pub percent: f64 }
pub(crate) struct Frame {
    pub status: Status, pub reason: String, pub samples: Vec<EngineSample>, pub invalid_pids: HashSet<u32>,
    sample_indices: HashMap<u32,Vec<usize>>,
}
impl Frame {
    pub fn unavailable(status: Status, reason: impl Into<String>) -> Self {
        Self { status, reason: reason.into(), samples: Vec::new(), invalid_pids: HashSet::new(), sample_indices: HashMap::new() }
    }
    pub fn ready(samples: Vec<EngineSample>, invalid_pids: HashSet<u32>) -> Self {
        let mut sample_indices: HashMap<u32,Vec<usize>>=HashMap::new();
        for (index,sample) in samples.iter().enumerate(){sample_indices.entry(sample.pid).or_default().push(index);}
        Self { status: Status::Measured, reason: "Windows GPU Engine · en yoğun GPU motoru".into(), samples, invalid_pids, sample_indices }
    }
    pub fn reading(&self, pids: &[u32], stable_pids: &HashSet<u32>) -> Reading {
        let pids: HashSet<_> = pids.iter().copied().collect();
        let total = pids.len();
        let absent = |status, reason: String| Reading { percent: None, status, reason, measured_processes: 0, total_processes: total };
        if total == 0 { return absent(Status::NoProcess, "Çalışan, tanınan AI süreci yok.".into()); }
        if self.status != Status::Measured { return absent(self.status, self.reason.clone()); }
        let mut by_process_engine: HashMap<(u32, &str), f64> = HashMap::new();
        let mut incomplete = HashSet::new();
        for sample in pids.iter().filter(|pid|stable_pids.contains(pid)).flat_map(|pid|self.sample_indices.get(pid).into_iter().flatten()).map(|index|&self.samples[*index]) {
            if !sample.percent.is_finite() || !(0.0..=100.0).contains(&sample.percent) { incomplete.insert(sample.pid); continue; }
            let key = (sample.pid, sample.engine.as_str());
            if let Some(previous) = by_process_engine.get_mut(&key) {
                // Repeated instance identities must not double-charge one process.
                *previous = previous.max(sample.percent); incomplete.insert(sample.pid);
            } else { by_process_engine.insert(key, sample.percent); }
        }
        let measured: HashSet<_> = by_process_engine.keys().map(|(pid,_)|*pid).collect();
        if measured.is_empty() {
            return if pids.iter().any(|pid| !stable_pids.contains(pid)) {
                absent(Status::WarmingUp, "Yeni süreç için ikinci GPU ölçüm aralığı bekleniyor.".into())
            } else { absent(Status::NoCounter, "Bu süreçler için geçerli GPU sayacı yok; kullanımın sıfır olduğu anlamına gelmez.".into()) };
        }
        let mut engines: HashMap<&str, f64> = HashMap::new();
        for ((_,engine), value) in by_process_engine { *engines.entry(engine).or_default() += value; }
        // Sum processes sharing an engine, then choose the busiest engine. Engines
        // and adapters are not added together into a misleading >100% GPU value.
        let percent = engines.values().copied().fold(0.0, f64::max).clamp(0.0,100.0);
        let partial = measured.len() != total || pids.iter().any(|pid| self.invalid_pids.contains(pid) || incomplete.contains(pid));
        Reading { percent: Some(percent), status: if partial { Status::Partial } else { Status::Measured },
            reason: if partial { format!("{}/{total} süreçte geçerli GPU değeri var. En yoğun motorda ölçülebilen alt sınırdır; eksik sayaçlar sıfır kabul edilmez.",measured.len()) }
                else { "Ölçülen süreçlerin en yoğun GPU motoru. Birden fazla GPU/motor toplanmaz; VRAM değildir.".into() },
            measured_processes: measured.len(), total_processes: total }
    }
}

/// GPU Engine instance identity contains PID and adapter/node identity. Keep the
/// full engine suffix so two adapters with an engine numbered 0 stay distinct.
#[cfg(any(windows,test))]
pub(crate) fn instance_identity(name: &str) -> Option<(u32,String)> {
    let rest = name.strip_prefix("pid_")?;
    let (pid, engine) = rest.split_once('_')?;
    let pid = pid.parse::<u32>().ok()?;
    let fields: Vec<_> = engine.split('_').collect();
    if fields.len()<9 || fields[0]!="luid" || fields[3]!="phys" || fields[5]!="eng" || fields[7]!="engtype" || fields[8].is_empty() { return None; }
    for hex in [fields[1],fields[2]] { u64::from_str_radix(hex.strip_prefix("0x")?,16).ok()?; }
    fields[4].parse::<u32>().ok()?; fields[6].parse::<u32>().ok()?;
    let engine = engine.rsplit_once('#').filter(|(_,index)|index.parse::<u32>().is_ok()).map(|(name,_)|name).unwrap_or(engine);
    Some((pid,engine.to_string()))
}

#[cfg(test)] mod tests {
    use super::*;
    fn sample(pid:u32,engine:&str,percent:f64)->EngineSample {EngineSample{pid,engine:engine.into(),percent}}
    #[test] fn engine_identity_distinguishes_adapters_and_rejects_ambiguous_names() {
        let a=instance_identity("pid_123_luid_0x00000000_0x000001ab_phys_0_eng_2_engtype_Compute_0").unwrap();
        let b=instance_identity("pid_123_luid_0x00000000_0x000001ac_phys_0_eng_2_engtype_Compute_0").unwrap();
        assert_eq!(a.0,123); assert_ne!(a.1,b.1);
        assert_eq!(instance_identity("pid_123_luid_0x00000000_0x000001ab_phys_0_eng_2_engtype_Compute_0#1").unwrap().1,a.1);
        for value in ["_Total","pid_1","pid_1_luid_x_y_phys_0_eng_0_engtype_3D","pid_4294967296_luid_0x0_0x0_phys_0_eng_0_engtype_3D"] {assert!(instance_identity(value).is_none());}
    }
    #[test] fn group_uses_busiest_engine_after_summing_only_shared_engine_processes() {
        let frame=Frame::ready(vec![sample(1,"adapter-a/3d",20.0),sample(2,"adapter-a/3d",30.0),sample(1,"adapter-a/copy",10.0),sample(2,"adapter-b/3d",45.0),sample(999,"adapter-a/3d",50.0)],HashSet::new());
        let reading=frame.reading(&[1,2],&HashSet::from([1,2]));
        assert_eq!(reading.percent,Some(50.0)); assert_eq!(reading.status,Status::Measured);
    }
    #[test] fn missing_invalid_and_new_processes_are_unknown_or_explicit_partial_not_zero() {
        let empty=Frame::ready(Vec::new(),HashSet::new());
        assert_eq!(empty.reading(&[1],&HashSet::from([1])).percent,None);
        assert_eq!(empty.reading(&[1],&HashSet::new()).status,Status::WarmingUp);
        let frame=Frame::ready(vec![sample(1,"a",0.0),sample(2,"a",f64::NAN)],HashSet::from([2]));
        assert_eq!(frame.reading(&[1],&HashSet::from([1])).percent,Some(0.0));
        assert_eq!(frame.reading(&[1],&HashSet::from([1])).status,Status::Measured);
        let partial=frame.reading(&[1,2],&HashSet::from([1,2])); assert_eq!(partial.status,Status::Partial); assert_eq!(partial.percent,Some(0.0));
        assert_eq!(frame.reading(&[2],&HashSet::from([1,2])).percent,None);
        assert_eq!(Frame::unavailable(Status::Unavailable,"no access").reading(&[1],&HashSet::from([1])).percent,None);
    }
    #[test] fn duplicate_counters_are_not_summed_and_empty_tool_is_not_idle() {
        let frame=Frame::ready(vec![sample(1,"a",20.0),sample(1,"a",20.0)],HashSet::new());
        let result=frame.reading(&[1],&HashSet::from([1]));assert_eq!(result.percent,Some(20.0));assert_eq!(result.status,Status::Partial);
        assert_eq!(frame.reading(&[],&HashSet::new()).status,Status::NoProcess);
    }
    #[test] fn gpu_samples_for_a_reused_pid_cannot_charge_a_new_process() {
        let frame=Frame::ready(vec![sample(1,"a",90.0),sample(2,"a",10.0)],HashSet::new());
        let stable=HashSet::from([2]);
        assert_eq!(frame.reading(&[1],&stable).percent,None);
        let known=frame.reading(&[1,2],&stable);assert_eq!(known.percent,Some(10.0));assert_eq!(known.status,Status::Partial);
    }
}
