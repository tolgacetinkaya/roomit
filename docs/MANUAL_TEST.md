# Manual screen checks — single disk and graphite workspace

Current native/visual acceptance belongs to the user. Automated tests cover the
scan engine, scan state, report formatting and group accounting; they do not
establish that the new native screen has been accepted.

## Start and select

1. Close your older Roomit window and open the freshly built exe from the handoff.
2. Choose **Bir klasör**, then **Klasör seç…**. Pick a modest project parent folder
   containing several projects. Cancelling the picker should retain the old path.
3. Press **Taramayı başlat**. Check the progress/counters below the scan setup and **İptal et**.
   A percentage is not shown because the total work is initially unknown.

## Read the grouped report

- **Genel bakış** shows a short summary plus project/tool cards. Source filenames
  should not flood the initial screen.
- A project card shows its recognized outputs/dependencies, not the whole project
  size. Expand it to see paths, reasons and member sizes.
- **AI araçları** combines multiple locations of the same tool. Nested parent/child
  findings are counted once. Everything remains read-only.
- **Projeler** contains all retained software groups. Search by name/tool/path and
  distinguish identical project names using the parent-location label/tooltip.
- **Büyük klasörler** begins with outer folders; expand for the included large child
  paths. Individual large files are collapsed separately.
- **Tarama ayrıntıları** contains disk outcomes, warnings and other protected data. Main
  navigation and search must not start a new scan.
- With many results, verify **Daha fazla göster** and lazy group expansion.

## Unlimited computer mode

- Select **Bütün bilgisayar**: detected local disk roots should appear. Discovery
  alone must not start scanning. Network disks stay outside this mode.
- Start: verify cumulative counts and disk index/count. There is no item-count
  or directory-depth cutoff in computer mode. Folder-mode defaults stay bounded.
- Cancel during a sufficiently long scan; measured data should be returned as
  partial, and later roots marked not scanned. Start another scan afterwards.
- An inaccessible/deleted/unmounted path should produce a readable error or
  partial result without making controls unusable.

## Size and platform checks

Compare logical file lengths, not physical allocated space. Hardlinks are counted
per path; sparse/compressed files and clones differ physically. Parent/child
folder rows overlap, so do not add them together. Truncated retained reports
produce lower-bound group labels while root totals keep all measured files.

Resize the window and try keyboard navigation: target choice, picker, start,
cancel, view buttons, search and group expansion should remain reachable.

macOS needs a real build/device test for native picker, APFS partitioning,
permissions, progress, cancellation and layout. No current Windows screenshot
or macOS native acceptance is claimed by this implementation pass.

## Single disk and redesigned workspace

1. Select **Tek disk**. Choose one local volume; confirm its name/path, total
   capacity and free space. No scan should start until you press Start.
2. Start and confirm only that volume appears in **Tarama ayrintilari**. Check
   progress and cancellation. Disk mode has no entry/depth limit; inaccessible
   files and links retain existing partial-result behavior.
3. Once a report arrives, setup should collapse and show the scanned location.
   **Alani degistir** must reopen it. Search/navigation must preserve the report.
4. Unplug a removable drive between selection and start: refresh/reselect or a
   readable error is expected, never a fallback to all disks.
5. Check the graphite/blue theme, icons and logo inside the built exe. Try the
   minimum window size and keyboard scope selection, scan, cancel and navigation.
6. On macOS, separately check system/Data volumes and external volume selection.
   APFS shared container capacities are OS-reported snapshots, not additive totals.
