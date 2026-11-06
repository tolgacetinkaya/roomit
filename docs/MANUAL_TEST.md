# Manual screen checks — grouped workspace and unlimited computer scan

Current native/visual acceptance belongs to the user. Automated tests cover the
scan engine, scan state, report formatting and group accounting; they do not
establish that the new native screen has been accepted.

## Start and select

1. Close your older Roomit window and open the freshly built exe from the handoff.
2. Choose **Bir klasör**, then **Klasör seç…**. Pick a modest project parent folder
   containing several projects. Cancelling the picker should retain the old path.
3. Press **Taramayı başlat**. Check the left-hand progress/counters and **İptal et**.
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
- **Ayrıntılar** contains disk outcomes, warnings and other protected data. Main
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
