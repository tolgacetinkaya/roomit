// Display-only compatibility for reports produced before the English release.
// Never apply this to file names, paths, or user-entered text.
const messages:readonly (readonly [string,string])[]=[
  [
    "Takılı RAM ve sistem toplamı farklı olabilir. Boş / kullanılabilir bellek, gerektiğinde geri kazanılabilen önbelleği de içerir. Yüzdelerin tabanı işletim sisteminin kullanabildiği toplam RAM'dir.",
    "Installed RAM may differ from the system total. Free / available memory includes cache that can be reclaimed. Percentages use the total RAM available to the operating system."
  ],
  [
    "CPU toplam cihaz kapasitesine göredir. RAM süreçlerin yerleşik belleğidir; paylaşılan sayfalar birden fazla süreçte sayılabilir. Docker container içi ve Chrome sekme bazlı ayrım yapılmaz.",
    "CPU is normalized to total device capacity. RAM is process resident memory; shared pages may be counted in several processes. Docker container internals and individual Chrome tabs are not separated."
  ],
  [
    "Masaüstü taramalarında öğe ve derinlik sınırı yoktur. Büyük öğeler listesindeki tüm ölçülen sonuçlar sayfa sayfa açılır; yazılım/AI grup özeti ve uyarı sayısı sınırlı tutulur.",
    "Desktop scans have no item or depth limit. All measured results are paged in Large items. Software/AI summaries and warnings are limited."
  ],
  [
    ". PATH, bilinen uygulama konumları ve kurulum kayıtları kontrol edilir. Özel kurulumlar, eklentiler, WSL, container içleri ve tarayıcıdaki AI siteleri otomatik keşfedilmez.",
    ". Checks PATH, known app locations, and installation records. Custom installations, plugins, WSL, container internals, and AI websites are not automatically discovered."
  ],
  [
    ". Süreçlerde en yoğun motor gösterilir; GPU'lar/motorlar toplanmaz. Eksik sayaçlar sıfır sayılmaz; kısmi değerler alt sınırdır. VRAM ölçülmüyor.",
    ". Processes show the busiest engine; GPUs and engines are not added together. Missing counters do not mean zero. Partial values are lower bounds. VRAM is not measured."
  ],
  [
    ". Bu cihazın GPU kullanımıdır; buluttaki model sunucusunu ölçmez. Eksik değerler sıfır değildir; kısmi yüzdeler ölçülebilen alt sınırı gösterir.",
    ". GPU usage is measured on this device, not on cloud model servers. Missing values do not mean zero. Partial percentages are measured lower bounds."
  ],
  [
    "Dosyaların boyutları ölçülüyor, proje ve araç grupları hazırlanıyor. İlerlemeyi yukarıdan takip edebilir, istediğinde iptal edebilirsin.",
    "Measuring file sizes and grouping projects and tools. Follow progress above and cancel at any time."
  ],
  [
    "Çalışmıyor olması kullanılmadığı anlamına gelmez. Geçmiş kullanım ve dosyanın güvenle kaldırılabileceği bu ölçümlerden belirlenmez.",
    "Not running does not mean unused. These measurements do not establish past use or whether a file can be safely removed."
  ],
  [
    "Boyutlar dosya uzunluklarının toplamıdır. Diskte ayrılan veya boşaltılabilecek alanı göstermez; hardlinkler her yol için sayılır.",
    "Sizes are the sum of logical file lengths, not allocated or reclaimable space. Hard links are counted for each path."
  ],
  [
    " dosya / alt ağaç hariç tutuldu. Hariç tutulan klasörlerin içindeki öğeler sayılmaz; boyutlar yalnızca taranan kapsamı gösterir.",
    " files / subtrees excluded. Items inside excluded folders are not counted. Sizes cover only the scanned scope."
  ],
  [
    "Mantıksal dosya boyutlarıdır. Boşaltılabilir alanı veya kullanılmayan veriyi göstermez. Model, geçmiş ve ayarlar korunur.",
    "Logical file sizes, not reclaimable space or unused data. Models, history, and settings are protected."
  ],
  [
    "{}/{total} süreçte geçerli GPU değeri var. En yoğun motorda ölçülebilen alt sınırdır; eksik sayaçlar sıfır kabul edilmez.",
    "{}/{total} processes have valid GPU measurements. This is a measured lower bound on the busiest engine; missing counters do not mean zero."
  ],
  [
    "Son 2 dakika · %0–100 ölçek · Geçmiş bu ekran açıkken birikir. Eksik veya duraklatılan ölçümler çizgide boşluk bırakır.",
    "Last 2 minutes · 0–100% scale · History accumulates while this view is open. Missing or paused measurements leave gaps."
  ],
  [
    "Biriken bağımlılıkları, AI modellerini ve büyük klasörleri tek bir görünümde keşfet. Yukarıdan bir alan seçerek başla.",
    "Explore accumulated dependencies, AI models, and large folders in one view. Choose a scope above to begin."
  ],
  [
    "Taranan klasörlerde değişiklik algılandı. Güncel sonuçlar için Yeniden tara düğmesine bas. Tarama otomatik başlamaz.",
    "Changes detected in scanned folders. Select Rescan to refresh your results. Scanning does not start automatically."
  ],
  [
    "Desteklenen katalogda bir kurulum veya veri klasörü bulunamadı. Özel / taşınabilir kurulumlar tespit edilemeyebilir.",
    "No installations or data folders matched the supported catalog. Custom or portable installations may not be detected."
  ],
  [
    "Kayıtlı sonuçlar açılamadı; kayıt dosyaları korundu. Yeni tarama yapabilir veya yeniden açmayı deneyebilirsin. ",
    "Could not open saved results. The saved files were preserved. Start a new scan or try opening them again. "
  ],
  [
    "Kartlar, araçlar ve süreçler için RAM gösterimi. Yüzdeler sistem toplamına göredir; tercih bu cihazda saklanır.",
    "RAM display for cards, tools, and processes. Percentages use the system total. Your preference is saved on this device."
  ],
  [
    "Tüm eşleşmeler sayfa sayfa gösterilir. Klasör boyutu alt dosyalarını da içerir; bu boyutları birlikte toplama.",
    "All matches are paged. Folder totals include their files. Do not add overlapping sizes together."
  ],
  [
    "Bu kapsamda tanınan AI verisi bulunamadı. Özel konumlar için Yeni tarama üzerinden bir klasör seçebilirsin.",
    "No recognized AI data found in this scope. Use New scan to select a custom folder."
  ],
  [
    "Bu klasör hariç tutulan bir konumda. Başka bir klasör seçin veya kullanıcı hariç tutma kuralını kaldırın.",
    "This folder is excluded. Choose another folder or remove the user exclusion."
  ],
  [
    "Hariç tutma seçimin kaydedildi. Ekrandaki sonuçlar önceki taramaya ait; yeni seçim için tekrar tara.",
    "Exclusions saved. Current results belong to the previous scan. Rescan to apply your changes."
  ],
  [
    "Üst klasörde .NET proje belirteci bulundu. Yeniden üretilebilirlik doğrulanmadı; inceleme gerekir.",
    "A .NET project marker was found in a parent folder. Reproducibility is unverified. Review required."
  ],
  [
    "Üst klasörde package.json bulundu. Bağımlılıkların kaldırılması yeniden kurulum gerektirebilir.",
    "A package.json was found in a parent folder. Removing dependencies may require reinstalling them."
  ],
  [
    "Python proje belirteci yanında ortam klasörü bulundu; yalnızca isim ve konumla sınıflandırıldı.",
    "An environment folder was found beside a Python project marker. Classified by name and location only."
  ],
  [
    "Çok sayıda değişiklik nedeniyle izlemenin güncelliği doğrulanamıyor. Yeniden taraman önerilir.",
    "Too many changes to verify freshness. Rescanning is recommended."
  ],
  [
    "Ağ hızı adaptör bazındadır. Uygulama başına trafik ve LAN / internet ayrımı henüz ölçülmüyor.",
    "Network rates are per adapter. Per-app traffic and LAN / internet separation are not measured yet."
  ],
  [
    "Grup özeti sınırlı tutuldu. Tüm ölçülen dosya ve klasörler Büyük öğeler görünümünde bulunur.",
    "Group summaries are limited. All measured files and folders are available in Large items."
  ],
  [
    "Bazı uygulama kayıtları okunamadı; standart sistem ve kurulum konumları yine hariç tutulur.",
    "Some application records could not be read. Standard system and installation locations remain excluded."
  ],
  [
    "Daha küçük öğeler haritada toplandı. Büyük öğeler listesinden tüm sonuçlara ulaşabilirsin.",
    "Smaller items are grouped on the map. Find every measured result in Large items."
  ],
  [
    "Uygulama açıkken bu kapsamdaki değişiklikler izleniyor. Yeniden taramayı sen başlatırsın.",
    "Changes in this scope are monitored while Roomit is open. You choose when to rescan."
  ],
  [
    "Bu tarama kaydedilemedi; yalnızca uygulama açıkken kullanılabilir. Önceki kayıt korundu. ",
    "This scan could not be saved and is only available while Roomit is open. Your previous saved scan was preserved. "
  ],
  [
    "Üst klasörde Cargo.toml bulundu. Derleme çıktısı adayı; özel içerik olasılığı dışlanmadı.",
    "A Cargo.toml was found in a parent folder. Potential build output; custom contents cannot be ruled out."
  ],
  [
    "Ölçülen süreçlerin en yoğun GPU motoru. Birden fazla GPU/motor toplanmaz; VRAM değildir.",
    "Busiest GPU engine across measured processes. GPUs and engines are not added together. This is not VRAM."
  ],
  [
    "Bilinen AI veri klasörü bulunamadı. Özel konumlar için Bir klasör seçeneğini kullanın.",
    "No known AI data folders found. Choose a folder to scan a custom location."
  ],
  [
    "AI aracının model veya talimat verisi olarak tanındı; içerik okunmadı, veri korunur.",
    "Recognized as AI model or instruction data. Contents were not read. Data is protected."
  ],
  [
    "Bu eski taramada alt klasör haritası yok. Yeniden tarama ile etkinleştirebilirsin.",
    "This older scan has no subfolder map. Rescan to enable it."
  ],
  [
    "Bu süreçler için geçerli GPU sayacı yok; kullanımın sıfır olduğu anlamına gelmez.",
    "No valid GPU counters for these processes. This does not mean zero usage."
  ],
  [
    "Seçilen disk artık bağlı değil veya taranabilir değil. Disk listesini yenileyin.",
    "The selected disk is disconnected or unavailable. Refresh the disk list."
  ],
  [
    "AI aracına ait geçmiş, ayar veya proje verileri içerebilir; cache kabul edilmez.",
    "May contain AI history, settings, or project data. Not classified as cache."
  ],
  [
    "Ayarlar yüklenemedi; hariç tutma seçimlerini korumak için tarama bekletiliyor. ",
    "Settings could not be loaded. Scanning is paused to preserve your exclusions. "
  ],
  [
    "Süreç başlangıç kimliği doğrulanamadığı için GPU değeri bu sürece bağlanamadı.",
    "GPU usage could not be attributed because the process start identity could not be verified."
  ],
  [
    "Python proje ağacındaki bytecode klasörü olarak tanındı; silme izni verilmez.",
    "Recognized as a bytecode folder in a Python project. This does not authorize deletion."
  ],
  [
    "Yalnızca bilinen AI veri konumları · Özel disk/klasör konumları kapsam dışı",
    "Known AI data locations only · Custom locations are outside this scope"
  ],
  [
    "Veri klasörü kurulum kanıtı değildir; eski bir kurulumdan kalmış olabilir.",
    "A data folder is not proof of installation. It may remain from a previous installation."
  ],
  [
    "Üst klasörde Gradle veya Maven proje belirteci bulundu; inceleme gerekir.",
    "A Gradle or Maven project marker was found in a parent folder. Review required."
  ],
  [
    "Uygulama paketleri (.app), içlerinden bir alt klasör seçilse de taranmaz.",
    "Application bundles (.app) are excluded, even when a subfolder is selected."
  ],
  [
    "Bazı alanlar taranamadı veya tarama durduruldu. Boyutlar kısmi olabilir.",
    "Some locations were inaccessible or scanning was stopped. Sizes may be partial."
  ],
  [
    "Seçimlerin bu cihazda kaydediliyor. Listeden çıkarmak klasöre dokunmaz.",
    "Your choices are saved on this device. Removing an exclusion does not change the folder."
  ],
  [
    "Windows GPU performans sayaçlarının adları okunamadı; ölçüm alınamıyor.",
    "Could not read Windows GPU performance counter names. Measurement unavailable."
  ],
  [
    "Klasör seçimi ve kalıcı ayarlar masaüstü uygulamasında kullanılabilir.",
    "Folder selection and saved settings are available in the desktop app."
  ],
  [
    "Modellerin, geçmişin ve AI veri klasörlerinin kapladığı alanı keşfet.",
    "Explore the space used by models, history, and AI data folders."
  ],
  [
    "GPU sayaçları yenilenirken değişti; sonraki ölçümde tekrar denenecek.",
    "GPU counters changed during refresh. Retrying with the next sample."
  ],
  [
    "Konum artık mevcut değil veya erişilemiyor. Yeniden taramayı deneyin.",
    "The location no longer exists or is inaccessible. Try rescanning."
  ],
  [
    "Proje kartları, tanınan çıktı ve bağımlılıkların toplamını gösterir.",
    "Project cards show the total of recognized outputs and dependencies."
  ],
  [
    "Hariç tutma listesini değiştirmek için taramanın bitmesini bekleyin.",
    "Wait for the scan to finish before changing exclusions."
  ],
  [
    "Bir tarama konumunda değişiklik izlemesi kesildi veya başlatılamadı.",
    "Change monitoring stopped or could not start at a scan location."
  ],
  [
    "Tarayıcı önizlemesi · Tarama masaüstü uygulamasında kullanılabilir.",
    "Browser preview · Scanning is available in the desktop app."
  ],
  [
    "Bu süreç için GPU değeri alınamadı; sıfır kullanım anlamına gelmez.",
    "GPU usage is unavailable for this process. This does not mean zero usage."
  ],
  [
    "Taranabilir yerel disk bulunamadı. Klasör seçerek tarayabilirsiniz.",
    "No scannable local disks found. Select a folder instead."
  ],
  [
    "Dosya değişikliklerinin tamamı alınamadı. Yeniden taraman önerilir.",
    "Some file change events were lost. Rescanning is recommended."
  ],
  [
    "Bağımlılıklar ve derleme çıktıları ait oldukları projede toplanır.",
    "Dependencies and build outputs are grouped by project."
  ],
  [
    "Modeller, ayarlar ve kullanıcı verileri AI aracına göre gruplanır.",
    "Models, settings, and user data are grouped by AI tool."
  ],
  [
    "Bu araç için GPU değeri alınamadı; sıfır kullanım anlamına gelmez.",
    "GPU usage is unavailable for this tool. This does not mean zero usage."
  ],
  [
    "Windows GPU sayacı bulunamadı. Sürücü bu ölçümü sunmuyor olabilir.",
    "No Windows GPU counters found. The driver may not expose this measurement."
  ],
  [
    "AI proje talimatı olarak tanındı; içerik okunmaz ve veri korunur.",
    "Recognized as AI project instructions. Contents are not read. Data is protected."
  ],
  [
    "Bir tarama konumu bağlantıyla değiştirilmiş; bu konum izlenmiyor.",
    "A scan location was replaced by a link and is not monitored."
  ],
  [
    "AI araçları, Chrome, Docker ve diğer süreçlerin canlı kullanımı.",
    "Live usage for AI tools, Chrome, Docker, and other processes."
  ],
  [
    "Büyük klasörler ve alt klasörlerin boyutları birlikte incelenir.",
    "Explore large folders alongside their subfolder sizes."
  ],
  [
    "Tarayıcı önizlemesi: Gerçek tarama için Roomit’i masaüstünde aç.",
    "Browser preview: open Roomit on your desktop to scan."
  ],
  [
    "Bir tarama zaten sürüyor. Tamamlanmasını veya iptalini bekleyin.",
    "A scan is already running. Wait for it to finish or cancel it."
  ],
  [
    "Bu platformda süreç bazlı GPU ölçümü bu sürümde desteklenmiyor.",
    "Per-process GPU measurement is not supported on this platform in this version."
  ],
  [
    "Dosya ve klasör boyutlarını filtrele. Yeniden tarama gerekmez.",
    "Filter files and folders by size. No rescan needed."
  ],
  [
    "Önceki tarama diski şu an kullanılamıyor. Taranacak alanı seç.",
    "The previous scan disk is unavailable. Choose a scan scope."
  ],
  [
    "GPU sayaç yanıtı güvenli boyut sınırını aştı; ölçüm alınamadı.",
    "GPU counter response exceeded the safe size limit. Measurement unavailable."
  ],
  [
    "Bazı dosya değişiklikleri okunamadı. Yeniden taraman önerilir.",
    "Some file changes could not be read. Rescanning is recommended."
  ],
  [
    "Dosya değişikliklerinin izlenmesi kesildi veya başlatılamadı.",
    "File change monitoring stopped or could not start."
  ],
  [
    "Tüm yerel diskler · Ağ diskleri kapsam dışı · Öğe sınırı yok",
    "All local disks · Network volumes excluded · No item limit"
  ],
  [
    "Kimlik bilgileri içerebilir; içerik okunmaz ve veri korunur.",
    "May contain credentials. Contents are not read. Data is protected."
  ],
  [
    "Tarama tamamlanıyor; iptal gerekirse tekrar deneyebilirsin.",
    "Finishing the scan. Retry cancellation if needed."
  ],
  [
    "Tarama tamamlandı; atlanan öğeler nedeniyle boyutlar kısmi.",
    "Scan completed. Sizes are partial because some items were skipped."
  ],
  [
    "Disk sayısı tarama sınırını aşıyor; klasör seçerek tarayın.",
    "The disk count exceeds the scan limit. Select a folder instead."
  ],
  [
    "Taranan bir konuma erişilemiyor; değişiklikler izlenemiyor.",
    "A scanned location is inaccessible. Changes cannot be monitored."
  ],
  [
    "Bilinen AI kullanıcı klasörleri · Diğer diskler taranmıyor",
    "Known AI user folders · Other disks are not scanned"
  ],
  [
    "Araçların, canlı kaynakların ve geride kalan AI verilerin.",
    "Your tools, live resources, and the AI data they leave behind."
  ],
  [
    "Bağımlılıklar ve derleme çıktıları, ait oldukları projede.",
    "Dependencies and build outputs, grouped by project."
  ],
  [
    "1–256 mutlak klasör yolu ve pozitif tarama sınırı gerekir.",
    "Provide 1–256 absolute folder paths and a positive scan limit."
  ],
  [
    "Kullanıcı klasörü bulunamadı. Bir klasör seçerek tarayın.",
    "Home folder not found. Select a folder to scan."
  ],
  [
    "Bu taramanın sonuçları artık açık değil. Yeniden tarayın.",
    "These scan results are no longer open. Please rescan."
  ],
  [
    "Claude Code ayar dosyası; içerik okunmaz ve veri korunur.",
    "Claude Code settings file. Contents are not read. Data is protected."
  ],
  [
    "Tarama kapsamı seçildi. Hazır olduğunda taramayı başlat.",
    "Scope selected. Start the scan when you are ready."
  ],
  [
    "Masaüstü uygulamaları ve CLI araçlarını birlikte keşfet.",
    "Discover desktop apps and CLI tools in one place."
  ],
  [
    " araç grubu · Boyutları karşılaştır, konumlarını incele.",
    " tool groups · Compare sizes and explore locations."
  ],
  [
    "Doğrudan bir klasör seçin; bağlantı veya dosya seçmeyin.",
    "Select a folder directly, not a link or file."
  ],
  [
    "Bu taramada sınıflandırılan yazılım çıktısı bulunamadı.",
    "No classified software outputs were found in this scan."
  ],
  [
    "0 veya daha büyük bir GB değeri gir. Örnek: 5 veya 0,5.",
    "Enter a GB value of 0 or greater. For example: 5 or 0.5."
  ],
  [
    "Bir tarama konumunda değişiklik izlemesi başlatılamadı.",
    "Could not start change monitoring at a scan location."
  ],
  [
    "Alt klasörleriyle birlikte incelenecek bir klasör seç.",
    "Select a folder to inspect, including its subfolders."
  ],
  [
    "Seçim taramayı başlatmaz. Alt klasörler de incelenir.",
    "Selecting a folder does not start a scan. Subfolders are included."
  ],
  [
    "Hariç tutma ayarları okunamadı: {e}. Dosya korunuyor.",
    "Could not read exclusions: {e}. The file was preserved."
  ],
  [
    "Kayıt biçimi desteklenmiyor veya sonuç yolu geçersiz.",
    "Unsupported saved format or invalid result path."
  ],
  [
    "Masaüstü uygulamaları ve terminal araçları birlikte.",
    "Desktop apps and terminal tools, together."
  ],
  [
    "Yeni süreç için ikinci GPU ölçüm aralığı bekleniyor.",
    "Waiting for a second GPU sample for the new process."
  ],
  [
    "Boyut sayacı sınırına ulaşıldı; tarama tamamlanmadı.",
    "Size counter limit reached. Scan incomplete."
  ],
  [
    "Alt klasörler için masaüstünde yeni bir tarama yap.",
    "Start a new desktop scan to explore subfolders."
  ],
  [
    "Haritanı oluşturmak için AI veri klasörlerini tara.",
    "Scan AI data folders to create your map."
  ],
  [
    " Güncel durumu görmek için yeniden tarayabilirsin.",
    " Rescan to see the current state."
  ],
  [
    "Yalnızca seçilen disk · Öğe ve derinlik sınırı yok",
    "Selected disk only · No item or depth limit"
  ],
  [
    "Bu boyut ve arama koşullarına uyan öğe bulunamadı.",
    "No items match this size and search."
  ],
  [
    "Sonuç yükleme iptal edildi. Tekrar deneyebilirsin.",
    "Result loading cancelled. You can try again."
  ],
  [
    "Yalnızca dosya ve klasör konumları gösterilebilir.",
    "Only file and folder locations can be revealed."
  ],
  [
    "Roomit — Taramadan hariç tutulacak klasörleri seç",
    "Roomit — Select folders to exclude"
  ],
  [
    "Nerelerin tarandığını ve atlanan alanları incele.",
    "Review scanned locations and skipped areas."
  ],
  [
    "GPU yüzdesi için ikinci ölçüm aralığı bekleniyor.",
    "Waiting for a second sample to measure GPU percentage."
  ],
  [
    "Geçerli bir yerel dosya veya klasör yolu gerekir.",
    "A valid local file or folder path is required."
  ],
  [
    "Klasör seçildi. Hazır olduğunda taramayı başlat.",
    "Folder selected. Start the scan when you are ready."
  ],
  [
    "Konum dosya yöneticisinde gösterilemedi: {error}",
    "Could not reveal the location in the file manager: {error}"
  ],
  [
    "Windows GPU sayaçları okunamadı (0x{code:08X}).",
    "Could not read Windows GPU counters (0x{code:08X})."
  ],
  [
    "Sonuç kaydı uygulamanın veri klasöründe olmalı.",
    "Saved results must be inside the app data folder."
  ],
  [
    "Bu sistemde değişiklik izlemesi desteklenmiyor.",
    "Change monitoring is not supported on this system."
  ],
  [
    "Disk seçildi. Hazır olduğunda taramayı başlat.",
    "Disk selected. Start the scan when you are ready."
  ],
  [
    "Konuma erişilemiyor. Yeniden taramayı deneyin.",
    "The location is inaccessible. Try rescanning."
  ],
  [
    "Derinlik sınırı nedeniyle alt ağaç atlandı: {}",
    "Subtree skipped at depth limit: {}"
  ],
  [
    "Tarama tamamlandığında özet burada görünecek.",
    "Your summary will appear here when the scan finishes."
  ],
  [
    "Şu anda bu araç için çalışan süreç görülmedi.",
    "No running processes detected for this tool."
  ],
  [
    "Bazı Windows kurulum kayıtlarına erişilemedi.",
    "Some Windows installation records were inaccessible."
  ],
  [
    "Değişiklik izlemesi için görev başlatılamadı.",
    "Could not start the change monitoring worker."
  ],
  [
    "Bir konumda dosya değişiklikleri izlenemiyor.",
    "File changes cannot be monitored at a location."
  ],
  [
    "Kaydedildi. Sonraki taramada geçerli olacak.",
    "Saved. Applies to your next scan."
  ],
  [
    "Boyutlarına göre dosya ve klasörleri keşfet.",
    "Explore files and folders by size."
  ],
  [
    "Dosyalar inceleniyor; sonuçlar hazırlanacak.",
    "Inspecting files. Results will appear here."
  ],
  [
    "İptal isteniyor; ölçülen sonuçlar korunacak…",
    "Requesting cancellation. Measured results will be preserved…"
  ],
  [
    "Son kayıt açıldı. Yeniden tarama yapılmadı.",
    "Last saved scan restored. No rescan was performed."
  ],
  [
    "GPU sayaç yanıtı geçersiz; ölçüm alınamadı.",
    "Invalid GPU counter response. Measurement unavailable."
  ],
  [
    "Sonuç yükleme görevi tamamlanamadı: {error}",
    "Result loading task failed: {error}"
  ],
  [
    "Sürüm geçmişi veya erişim verileri korunur.",
    "Version history and access data are protected."
  ],
  [
    "Araç keşfi masaüstü uygulamasında çalışır.",
    "Tool discovery is available in the desktop app."
  ],
  [
    "Bağlantı yerine doğrudan bir klasör seçin.",
    "Select a folder directly instead of a link."
  ],
  [
    "Değişen bağlantı/reparse point atlandı: {}",
    "Changed link/reparse point skipped: {}"
  ],
  [
    "Disk sınırı / ayrı tarama kökü atlandı: {}",
    "Volume boundary / separate scan root skipped: {}"
  ],
  [
    "Bu sonucun değişiklik izlemesi açık değil.",
    "Change monitoring is not active for these results."
  ],
  [
    "Dosya değişikliğinin konumu belirlenemedi.",
    "The file change location could not be identified."
  ],
  [
    "Tarama sınırına ulaşıldı; sonuçlar kısmi.",
    "Scan limit reached. Results are partial."
  ],
  [
    " Eksik ölçümler boşluk olarak gösterilir.",
    " Missing measurements appear as gaps."
  ],
  [
    "Projelerine ve araçlarına göre düzenlendi",
    "Organized by project and tool"
  ],
  [
    "Dilimleri seçerek araçtan klasöre ilerle.",
    "Select a sector to explore tools and folders."
  ],
  [
    "GPU sayaç adı okunamadı; ölçüm alınamadı.",
    "Could not read GPU counter name. Measurement unavailable."
  ],
  [
    "Tarama sürerken kayıtlı sonuç yüklenemez.",
    "Saved results cannot be loaded while scanning."
  ],
  [
    "Kayıtlı sonuç konumu bir bağlantı olamaz.",
    "The saved result location cannot be a link."
  ],
  [
    "Geçici sonuç dizinine yazılamadı: {error}",
    "Could not write to the temporary result directory: {error}"
  ],
  [
    "GitHub Copilot proje talimatları korunur.",
    "GitHub Copilot project instructions are protected."
  ],
  [
    "{} öğe sınırına ulaşıldı; sonuçlar kısmi.",
    "{} item limit reached. Results are partial."
  ],
  [
    "İzlenebilir bir tarama konumu bulunamadı.",
    "No scan locations could be monitored."
  ],
  [
    "Dosya değişikliği izlemesi başlatılamadı.",
    "Could not start file change monitoring."
  ],
  [
    " klasörünü hariç tutma listesinden çıkar",
    ": remove folder from exclusions"
  ],
  [
    "Kaydedilemedi; önceki seçimler korundu. ",
    "Could not save. Your previous choices were preserved. "
  ],
  [
    "GPU ölçülemiyor: canlı ölçüm alınamadı. ",
    "GPU unavailable: no live measurement. "
  ],
  [
    "Windows GPU sayaçlarına erişim izni yok.",
    "Access to Windows GPU counters was denied."
  ],
  [
    "Windows GPU Engine · en yoğun GPU motoru",
    "Windows GPU Engine · busiest GPU engine"
  ],
  [
    "Bu boyut desteklenen aralığın üzerinde.",
    "This size exceeds the supported range."
  ],
  [
    "Bu düzeyde boyutu ölçülmüş alt öğe yok.",
    "No measured child items at this level."
  ],
  [
    "Hariç tutma ayarları kaydedilemedi: {e}",
    "Could not save exclusions: {e}"
  ],
  [
    "Kesikli çizgi: kısmi ölçüm / alt sınır",
    "Dashed line: partial measurement / lower bound"
  ],
  [
    " sistem belleği · Takılı RAM okunamadı",
    " system memory · Installed RAM unavailable"
  ],
  [
    "Git worktree bağlantı dosyası korunur.",
    "Git worktree link files are protected."
  ],
  [
    " klasör. Hiçbir dosya değiştirilmedi.",
    " folders. No files were changed."
  ],
  [
    "Masaüstü uygulamasında kullanılabilir",
    "Available in the desktop app"
  ],
  [
    "Kayıtlı tarama sürümü desteklenmiyor.",
    "Unsupported saved scan version."
  ],
  [
    "Windows uygulama paketleri okunamadı.",
    "Could not read Windows app packages."
  ],
  [
    "Tarama iptal edildi; sonuçlar kısmi.",
    "Scan cancelled. Results are partial."
  ],
  [
    "Bu süreç için güncel GPU ölçümü yok.",
    "No current GPU measurement for this process."
  ],
  [
    "Tarama görevi tamamlanamadı: {error}",
    "Scan task could not be completed: {error}"
  ],
  [
    "{} içinde bir öğe okunamadı: {error}",
    "Could not read an item in {}: {error}"
  ],
  [
    "Seçilen tarama kapsamının tamamında",
    "Across the selected scan scope"
  ],
  [
    "Tanınan yazılım, AI ve korunan veri",
    "Recognized software, AI, and protected data"
  ],
  [
    "Hariç tutma ayarları okunamadı: {e}",
    "Could not read exclusions: {e}"
  ],
  [
    "Disk/klasör taranamadı: {}: {error}",
    "Could not scan disk/folder: {}: {error}"
  ],
  [
    "Taranabilir yerel disk bulunamadı.",
    "No scannable local disks found."
  ],
  [
    "Konumu açmak için öğeye odaklanıp ",
    "Focus an item and press "
  ],
  [
    "Aramana uygun AI aracı bulunamadı.",
    "No AI tools match your search."
  ],
  [
    "Chrome, Docker, araç veya PID ara…",
    "Search Chrome, Docker, tool, or PID…"
  ],
  [
    "Kayıtlı tarama bilgileri geçersiz.",
    "Invalid saved scan metadata."
  ],
  [
    "Bağlantı/reparse point atlandı: {}",
    "Link/reparse point skipped: {}"
  ],
  [
    "Değişiklik izlemesi başlatılamadı.",
    "Could not start change monitoring."
  ],
  [
    "Değişiklik izlemesi hazırlanıyor…",
    "Preparing change monitoring…"
  ],
  [
    "Son taramanın tamamına bir bakış.",
    "An overview of your latest scan."
  ],
  [
    "Klasör seçimi taramayı başlatmaz.",
    "Selecting a folder does not start a scan."
  ],
  [
    ": listelenen AI verileri içinde %",
    ": share of listed AI data: "
  ],
  [
    "Bu taramada bulunan araç grupları",
    "Tool groups found in this scan"
  ],
  [
    " · Ölçülen dosya ve alt klasörler",
    " · Measured files and subfolders"
  ],
  [
    "Eksik GPU değeri sıfır değildir.",
    "A missing GPU value does not mean zero usage."
  ],
  [
    "Ayrıntıları aç · Konumu göster: ",
    "Open details · Reveal location: "
  ],
  [
    "Etkileşimli AI depolama haritası",
    "Interactive AI storage map"
  ],
  [
    "Ayar klasörü oluşturulamadı: {e}",
    "Could not create settings folder: {e}"
  ],
  [
    "Sonuç dizini oluşturulamadı: {e}",
    "Could not create result directory: {e}"
  ],
  [
    "Klasör tarama sırasında değişti.",
    "Folder changed during scan."
  ],
  [
    "Değişiklik izlemesi okunamadı: ",
    "Could not read monitoring status: "
  ],
  [
    "Disk listesi alınamadı · Yenile",
    "Disks unavailable · Refresh"
  ],
  [
    "Hariç tutma seçimin kaydedildi.",
    "Exclusions saved."
  ],
  [
    "Aramana uygun proje bulunamadı.",
    "No projects match your search."
  ],
  [
    "\\nÜst klasörde seçili göster · ",
    "\\nSelect in parent folder · "
  ],
  [
    "Şu anda çalışan süreç görülmedi",
    "No running processes detected"
  ],
  [
    "Tüm araçları ve konumlarını gör",
    "View all tools and locations"
  ],
  [
    "Çalışan uygulamalar ve süreçler",
    "Running apps and processes"
  ],
  [
    "GPU sayaç adı sonlandırılmamış.",
    "GPU counter name is not terminated."
  ],
  [
    "Çalışan, tanınan AI süreci yok.",
    "No running recognized AI processes."
  ],
  [
    "Disk listesi alınamadı: {error}",
    "Could not load disks: {error}"
  ],
  [
    "Sonuç yükleme durumu okunamadı.",
    "Could not read result loading state."
  ],
  [
    "Roomit — Taranacak klasörü seç",
    "Roomit — Select a folder to scan"
  ],
  [
    " çalışan AI aracı · bu cihazda",
    " running AI tools · on this device"
  ],
  [
    "Mutlak bir klasör yolu seçin.",
    "Select an absolute folder path."
  ],
  [
    "Kullanıcı klasörü bulunamadı.",
    "Home folder not found."
  ],
  [
    "Canlı ölçüm durumu okunamadı.",
    "Could not read live monitoring state."
  ],
  [
    "· Masaüstünde kullanılabilir",
    "· Available on desktop"
  ],
  [
    "Boyuta göre AI veri dağılımı",
    "AI data by size"
  ],
  [
    "Kurulu AI araçları aranıyor…",
    "Discovering installed AI tools…"
  ],
  [
    "Konum gösterilemedi: {error}",
    "Could not reveal location: {error}"
  ],
  [
    "Taranabilir disk bulunamadı",
    "No scannable disks found"
  ],
  [
    "Yerel diskler hazırlanıyor…",
    "Preparing local disks…"
  ],
  [
    "Bu taramada tanınan gruplar",
    "Groups recognized in this scan"
  ],
  [
    "Pencere işlemi yapılamadı: ",
    "Window action failed: "
  ],
  [
    "Kaydedilen tarama sonuçları",
    "Saved scan results"
  ],
  [
    "Süreç ölçümleri bekleniyor…",
    "Waiting for process measurements…"
  ],
  [
    "Sonuç dizini kilitlenemedi.",
    "Could not lock result directory."
  ],
  [
    "Sonuç yükleme iptal edildi.",
    "Result loading cancelled."
  ],
  [
    "Sonuçlar okunamadı: {error}",
    "Could not read results: {error}"
  ],
  [
    "Özel dosya türü atlandı: {}",
    "Special file type skipped: {}"
  ],
  [
    "Geçersiz değişiklik paketi.",
    "Invalid change event packet."
  ],
  [
    "Kapasite bilgisi alınamadı",
    "Capacity unavailable"
  ],
  [
    "İptal isteği iletilemedi: ",
    "Could not request cancellation: "
  ],
  [
    "Klasör seçici açılamadı: ",
    "Could not open the folder picker: "
  ],
  [
    "AI ayarları / talimatları",
    "AI settings / instructions"
  ],
  [
    "Toplam işlemci kapasitesi",
    "Total CPU capacity"
  ],
  [
    "Tarama tarihi bilinmiyor.",
    "Scan date unknown."
  ],
  [
    "Alt klasörler yükleniyor…",
    "Loading subfolders…"
  ],
  [
    "Canlı ölçüm duraklatıldı.",
    "Live monitoring paused."
  ],
  [
    "Tespit kanıtı ve konumlar",
    "Discovery evidence and locations"
  ],
  [
    "Ayarlar kilidi alınamadı.",
    "Could not lock settings."
  ],
  [
    "Klasör doğrulanamadı: {e}",
    "Could not validate folder: {e}"
  ],
  [
    "Bilinen AI veri konumları",
    "Known AI data locations"
  ],
  [
    "Sonuç klasörü bulunamadı.",
    "Result folder not found."
  ],
  [
    "Güncellik doğrulanamıyor",
    "Freshness could not be verified"
  ],
  [
    "Yerel diskler bulunuyor…",
    "Finding local disks…"
  ],
  [
    "Disk listesi alınamadı: ",
    "Could not load disks: "
  ],
  [
    " tuşlarına basabilirsin.",
    " to reveal its location."
  ],
  [
    "Güncel bellek ölçümü yok",
    "No current memory measurement"
  ],
  [
    "AI kullanıcı verileri · ",
    "AI user data · "
  ],
  [
    "Diğer korunan veriler · ",
    "Other protected data · "
  ],
  [
    "Kurulum kaydı: {display}",
    "Installation record: {display}"
  ],
  [
    "Geçersiz tarama kimliği.",
    "Invalid scan ID."
  ],
  [
    "Tarama durumu okunamadı.",
    "Could not read scan state."
  ],
  [
    "Geçersiz tarama kapsamı.",
    "Invalid scan scope."
  ],
  [
    "Geçersiz boyut filtresi.",
    "Invalid size filter."
  ],
  [
    "İzleme durumu okunamadı.",
    "Could not read monitoring state."
  ],
  [
    "Henüz klasör eklemedin.",
    "No folders added yet."
  ],
  [
    "AI klasörleri taranıyor",
    "Scanning AI folders"
  ],
  [
    "Bağlı tüm yerel diskler",
    "All connected local disks"
  ],
  [
    " ek uyarı listelenmedi.",
    " additional warnings not listed."
  ],
  [
    "Canlı ölçüm bekleniyor…",
    "Waiting for live measurement…"
  ],
  [
    "Canlı ölçüm alınamadı: ",
    "Live measurement unavailable: "
  ],
  [
    "Aramana uyan süreç yok.",
    "No processes match your search."
  ],
  [
    "Ağ adaptörü bulunamadı.",
    "No network adapters found."
  ],
  [
    "Kayıt kilidi alınamadı.",
    "Could not lock saved results."
  ],
  [
    "Geçersiz sonuç klasörü.",
    "Invalid result folder."
  ],
  [
    "Geçersiz sonuç sayfası.",
    "Invalid result page."
  ],
  [
    "Geçersiz sorgu kimliği.",
    "Invalid query ID."
  ],
  [
    "Sonuçlar hazırlanıyor…",
    "Preparing results…"
  ],
  [
    "Tarama tamamlanamadı: ",
    "Scan could not be completed: "
  ],
  [
    "Explorer’a gönderildi.",
    "Sent to Explorer."
  ],
  [
    " · İptal edildi, kısmi",
    " · Cancelled, partial"
  ],
  [
    "Araç keşfi başarısız: ",
    "Tool discovery failed: "
  ],
  [
    "GPU · Ölçüm bekleniyor",
    "GPU · Waiting for measurement"
  ],
  [
    "· Ayarlar yüklenemedi",
    "· Settings unavailable"
  ],
  [
    "Sonuçlar güncel değil",
    "Results are out of date"
  ],
  [
    "Sonuçlar hazırlanıyor",
    "Preparing results"
  ],
  [
    "Diğer / listelenmeyen",
    "Other / unlisted"
  ],
  [
    "Güncel GPU ölçümü yok",
    "No current GPU measurement"
  ],
  [
    "Boyut listelerine git",
    "Go to size lists"
  ],
  [
    " yüklemesini iptal et",
    ": cancel loading"
  ],
  [
    "Canlı ölçüm alınamadı",
    "Live measurement unavailable"
  ],
  [
    "RAM: yüksekten düşüğe",
    "RAM: high to low"
  ],
  [
    "CPU: yüksekten düşüğe",
    "CPU: high to low"
  ],
  [
    "GPU: yüksekten düşüğe",
    "GPU: high to low"
  ],
  [
    "Geçersiz klasör yolu.",
    "Invalid folder path."
  ],
  [
    "Arama metni çok uzun.",
    "Search text is too long."
  ],
  [
    "Taranacak diski seç…",
    "Select a disk to scan…"
  ],
  [
    "Taranacak diski seç.",
    "Select a disk to scan."
  ],
  [
    "AI depolama haritası",
    "AI storage map"
  ],
  [
    "Henüz bir tarama yok",
    "No scans yet"
  ],
  [
    "Tarama başlatılıyor…",
    "Starting scan…"
  ],
  [
    "İlk ölçüm bekleniyor",
    "Waiting for first sample"
  ],
  [
    "Boş / kullanılabilir",
    "Free / available"
  ],
  [
    "Finder’a gönderildi.",
    "Sent to Finder."
  ],
  [
    "Pencereyi geri yükle",
    "Restore window"
  ],
  [
    "Sonuçlar yükleniyor…",
    "Loading results…"
  ],
  [
    "Son tarama sonuçları",
    "Latest scan results"
  ],
  [
    "Araçları yeniden bul",
    "Refresh discovery"
  ],
  [
    "Geçersiz sayfa yönü.",
    "Invalid page direction."
  ],
  [
    "AI proje talimatları",
    "AI project instructions"
  ],
  [
    "Ayarlar yükleniyor…",
    "Loading settings…"
  ],
  [
    "Diskler yükleniyor…",
    "Loading disks…"
  ],
  [
    "AI kullanıcı verisi",
    "AI user data"
  ],
  [
    "Daha fazla göster (",
    "Show more ("
  ],
  [
    "Tarama başlangıcı: ",
    "Scan started: "
  ],
  [
    "Ağ ölçümü alınamadı",
    "Network measurement unavailable"
  ],
  [
    "İlk ölçüm alınıyor…",
    "Collecting first sample…"
  ],
  [
    " erişilebilir süreç",
    " accessible processes"
  ],
  [
    " klasör + otomatik",
    " folders + automatic"
  ],
  [
    "Tarama alanını seç",
    "Choose a scan scope"
  ],
  [
    "Tarama ayrıntıları",
    "Scan details"
  ],
  [
    "AI depolama alanın",
    "Your AI storage"
  ],
  [
    "Tarama tamamlandı.",
    "Scan completed."
  ],
  [
    "GPU · AI süreçleri",
    "GPU · AI processes"
  ],
  [
    "Yazılım / AI grubu",
    "Software / AI groups"
  ],
  [
    "Klasörde göster · ",
    "Show in folder · "
  ],
  [
    "Yüklemeyi iptal et",
    "Cancel loading"
  ],
  [
    " öğe gösteriliyor.",
    " items shown."
  ],
  [
    "CLI dosyası / PATH",
    "CLI file / PATH"
  ],
  [
    "Geçersiz öğe türü.",
    "Invalid item type."
  ],
  [
    " · son 2 dakika · ",
    " · last 2 minutes · "
  ],
  [
    " doluluk oranı: %",
    " used: "
  ],
  [
    "AI çalışma alanın",
    "Your AI workspace"
  ],
  [
    " ölçüm, en düşük ",
    " samples, minimum "
  ],
  [
    "Kullanılan bellek",
    "Memory used"
  ],
  [
    "Yazılım projeleri",
    "Software projects"
  ],
  [
    "Klasörde göster: ",
    "Show in folder: "
  ],
  [
    "Taranan AI verisi",
    "Scanned AI data"
  ],
  [
    "Çalışan süreç yok",
    "No running processes"
  ],
  [
    "Ölçüm alınamadı: ",
    "Measurement unavailable: "
  ],
  [
    "Ölçüm bekleniyor",
    "Waiting for measurement"
  ],
  [
    "İnceleme gerekli",
    "Review required"
  ],
  [
    "Toplam AI verisi",
    "Total AI data"
  ],
  [
    " dosya incelendi",
    " files inspected"
  ],
  [
    "Boyut sınırı yok",
    "No minimum size"
  ],
  [
    "AI alan haritası",
    "AI space map"
  ],
  [
    "Ayrıntı için seç",
    "Select for details"
  ],
  [
    " · 2 sn aralıkla",
    " · Every 2 seconds"
  ],
  [
    "Süreç / uygulama",
    "Process / app"
  ],
  [
    "Kapasite + yüzde",
    "Capacity + percent"
  ],
  [
    "Keşif kapsamı · ",
    "Discovery scope · "
  ],
  [
    "Süreç sıralaması",
    "Process sort order"
  ],
  [
    "Uygulama dosyası",
    "Application file"
  ],
  [
    "Kullanıcı verisi",
    "User data"
  ],
  [
    "Bütün bilgisayar",
    "Whole computer"
  ],
  [
    "Canlı kaynaklar",
    "Live resources"
  ],
  [
    "Araçlarını tanı",
    "Know your tools"
  ],
  [
    "Büyük resmi gör",
    "See the big picture"
  ],
  [
    "Derleme çıktısı",
    "Build output"
  ],
  [
    "Ölçüm alınamadı",
    "Measurement unavailable"
  ],
  [
    "GPU ölçülemiyor",
    "GPU unavailable"
  ],
  [
    "İncelenen dosya",
    "Files inspected"
  ],
  [
    "İncelenen boyut",
    "Size inspected"
  ],
  [
    "Tanımlanan alan",
    "Recognized space"
  ],
  [
    "Ayrıntıları gör",
    "View details"
  ],
  [
    "Bulunan araçlar",
    "Discovered tools"
  ],
  [
    "Konum açılıyor…",
    "Opening location…"
  ],
  [
    "Klasörde göster",
    "Show in folder"
  ],
  [
    "Kenar çubuğunu ",
    "Sidebar: "
  ],
  [
    "Pencereyi büyüt",
    "Maximize window"
  ],
  [
    "Henüz taranmadı",
    "Not scanned yet"
  ],
  [
    " sistem belleği",
    " system memory"
  ],
  [
    "Henüz ölçülmedi",
    "Not measured yet"
  ],
  [
    "Ölçümü duraklat",
    "Pause monitoring"
  ]
];
export function reportMessage(value:string):string {
  if(value==="Ortam ayarları")return "Environment settings";
  for(const [before,after]of messages){if(value===before)return after;}
  // Dynamic errors have an OS-generated suffix or a path; preserve that suffix.
  for(const [before,after]of messages){if(!before.includes('{')&&before.endsWith(': ')&&value.startsWith(before))return after+value.slice(before.length);}
  for(const [before,after]of messages){
    if(!before.includes('{'))continue;
    const escape=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    const pattern=before.split(/\{[^}]*\}/).map(escape).join("(.*?)");
    const match=new RegExp(`^${pattern}$`,"s").exec(value);
    if(match){let index=0;return after.replace(/\{[^}]*\}/g,()=>match[++index]??"");}
  }
  return value;
}
