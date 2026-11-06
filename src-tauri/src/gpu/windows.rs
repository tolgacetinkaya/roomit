use super::{EngineSample, Frame, Status, instance_identity};
use std::{collections::HashSet, mem::{align_of,size_of}, ptr, time::{Duration,Instant}};
use windows_sys::Win32::System::Performance::*;

struct Query { query: PDH_HQUERY, counter: PDH_HCOUNTER }
// PDH query handles are not thread-affine. This owner is moved between blocking
// workers, but all access is serialized by the existing monitor sampler mutex.
unsafe impl Send for Query {}
impl Drop for Query { fn drop(&mut self) { unsafe { PdhCloseQuery(self.query); } } }
impl Query {
    fn open() -> Result<Self,String> {
        let mut query=ptr::null_mut();
        let code=unsafe {PdhOpenQueryW(ptr::null(),0,&mut query)};
        if code!=0 {return Err(error(code));}
        let mut owner=Self {query,counter:ptr::null_mut()};
        let path:Vec<u16>="\\GPU Engine(*)\\Utilization Percentage\0".encode_utf16().collect();
        let code=unsafe{PdhAddEnglishCounterW(query,path.as_ptr(),0,&mut owner.counter)};
        if code!=0 {return Err(error(code));}
        Ok(owner)
    }
    fn collect(&self)->Result<(),String>{
        let code=unsafe{PdhCollectQueryData(self.query)};
        if code==0 || code==PDH_NO_DATA {Ok(())}else{Err(error(code))}
    }
    fn values(&self)->Result<Frame,String>{
        // Instance counts may change between size and data calls. Requery the
        // required size on a bounded retry; never truncate a counter array.
        for _ in 0..3 {
            let mut bytes=0;let mut count=0;
            let code=unsafe{PdhGetFormattedCounterArrayW(self.counter,PDH_FMT_DOUBLE,&mut bytes,&mut count,ptr::null_mut())};
            if code==PDH_NO_DATA || code==PDH_CSTATUS_NO_INSTANCE {return Ok(Frame::ready(Vec::new(),HashSet::new()));}
            if code!=PDH_MORE_DATA && code!=0 {return Err(error(code));}
            if bytes==0 {return Ok(Frame::ready(Vec::new(),HashSet::new()));}
            if bytes as usize>16*1024*1024 || align_of::<PDH_FMT_COUNTERVALUE_ITEM_W>()>align_of::<u64>() {return Err("GPU counter response exceeded the safe size limit. Measurement unavailable.".into());}
            // The native buffer contains both structs and UTF-16 names. u64
            // storage supplies proper alignment for the structs on Windows.
            let mut buffer=vec![0u64;(bytes as usize).div_ceil(size_of::<u64>())];
            let code=unsafe{PdhGetFormattedCounterArrayW(self.counter,PDH_FMT_DOUBLE,&mut bytes,&mut count,buffer.as_mut_ptr().cast())};
            if code==PDH_MORE_DATA || code==PDH_INVALID_ARGUMENT {continue;}
            if code==PDH_NO_DATA || code==PDH_CSTATUS_NO_INSTANCE {return Ok(Frame::ready(Vec::new(),HashSet::new()));}
            if code!=0 {return Err(error(code));}
            let capacity=buffer.len()*size_of::<u64>();
            if bytes as usize>capacity || count as usize>capacity/size_of::<PDH_FMT_COUNTERVALUE_ITEM_W>() {return Err("Invalid GPU counter response. Measurement unavailable.".into());}
            let base=buffer.as_ptr() as usize;let end=base+bytes as usize;
            let items=unsafe{std::slice::from_raw_parts(buffer.as_ptr().cast::<PDH_FMT_COUNTERVALUE_ITEM_W>(),count as usize)};
            let mut samples=Vec::new();let mut invalid_pids=HashSet::new();
            for item in items {
                let name=item.szName as usize;
                if name<base || name>=end || name%2!=0 {return Err("Could not read GPU counter name. Measurement unavailable.".into());}
                let units=(end-name)/2;
                let wide=unsafe{std::slice::from_raw_parts(item.szName,units)};
                let Some(length)=wide.iter().position(|c|*c==0)else{return Err("GPU counter name is not terminated.".into());};
                let name=String::from_utf16_lossy(&wide[..length]);
                let Some((pid,engine))=instance_identity(&name)else{
                    if let Some(pid)=name.strip_prefix("pid_").and_then(|s|s.split('_').next()).and_then(|s|s.parse::<u32>().ok()){invalid_pids.insert(pid);}
                    continue;
                };
                let status=item.FmtValue.CStatus;
                let percent=unsafe{item.FmtValue.Anonymous.doubleValue};
                if (status==PDH_CSTATUS_VALID_DATA || status==PDH_CSTATUS_NEW_DATA) && percent.is_finite() && (0.0..=100.0).contains(&percent) {
                    samples.push(EngineSample {pid,engine,percent});
                }else{invalid_pids.insert(pid);}
            }
            return Ok(Frame::ready(samples,invalid_pids));
        }
        Err("GPU counters changed during refresh. Retrying with the next sample.".into())
    }
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn native_pdh_gpu_probe_reports_live_data_or_explicit_unavailability() {
        let mut collector=Collector::default();let first=collector.sample();
        assert_ne!(first.status,Status::Measured);
        std::thread::sleep(Duration::from_millis(1200));let next=collector.sample();
        println!("Windows GPU probe: first={:?}; second={:?}; valid engines={}; invalid PID counters={}; {}",first.status,next.status,next.samples.len(),next.invalid_pids.len(),next.reason);
        assert!(next.samples.iter().all(|s|s.percent.is_finite()&&(0.0..=100.0).contains(&s.percent)));
        if next.status==Status::Unavailable {assert!(!next.reason.is_empty());}
        // Simulate a long pause without touching the OS clock or sleeping 15s.
        if collector.query.is_some(){collector.last=Some(Instant::now()-Duration::from_secs(16));assert_eq!(collector.sample().status,Status::WarmingUp);}
    }
}
fn error(code:u32)->String{
    if code==5 || code==PDH_ACCESS_DENIED {"Access to Windows GPU counters was denied.".into()}
    else if code==PDH_CANNOT_READ_NAME_STRINGS {"Could not read Windows GPU performance counter names. Measurement unavailable.".into()}
    else if code==PDH_CSTATUS_NO_OBJECT || code==PDH_CSTATUS_NO_COUNTER {"No Windows GPU counters found. The driver may not expose this measurement.".into()}
    else{format!("Could not read Windows GPU counters (0x{code:08X}).")}
}
#[derive(Default)]
pub(crate) struct Collector { query:Option<Query>, last:Option<Instant>, failed_at:Option<Instant>, failure:String }
impl Collector {
    pub fn sample(&mut self)->Frame{
        let now=Instant::now();
        if self.failed_at.is_some_and(|t|now.duration_since(t)<Duration::from_secs(10)) {return Frame::unavailable(Status::Unavailable,self.failure.clone());}
        if self.last.is_some_and(|t|now.duration_since(t)>Duration::from_secs(15)) {self.query=None;}
        let initializing=self.query.is_none();
        if initializing {
            match Query::open(){Ok(query)=>self.query=Some(query),Err(reason)=>return self.fail(reason)}
        }
        let query=self.query.as_ref().unwrap();
        if let Err(reason)=query.collect(){return self.fail(reason);}
        self.last=Some(Instant::now());
        if initializing{return Frame::unavailable(Status::WarmingUp,"Waiting for a second sample to measure GPU percentage.");}
        match query.values(){Ok(frame)=>frame,Err(reason)=>self.fail(reason)}
    }
    fn fail(&mut self,reason:String)->Frame{
        self.query=None;self.failed_at=Some(Instant::now());self.failure=reason.clone();
        Frame::unavailable(Status::Unavailable,reason)
    }
}
