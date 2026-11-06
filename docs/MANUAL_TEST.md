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
- **Büyük öğeler** lists files and subdirectories separately, with a minimum GB filter.
- **Tarama ayrıntıları** contains disk outcomes, warnings and other protected data. Main
  navigation and search must not start a new scan.
- With many groups, verify **Daha fazla göster** and lazy expansion; size results use separate Previous/Next pages.

## Unlimited computer mode

- Select **Bütün bilgisayar**: detected local disk roots should appear. Discovery
  alone must not start scanning. Network disks stay outside this mode.
- Start: verify cumulative counts and disk index/count. There is no item-count or directory-depth cutoff in any desktop scan scope.
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

## Klasörde göster and direct shortcut

- On a collapsed project card, click **Klasörde göster**. Its containing folder
  should open in Explorer/Finder with the item selected when supported.
- Expand the card and use the action on a specific result. It should reveal that
  result, not its parent project. Try a large-file row and a root-volume row too.
- Focus a card summary or result row with Tab (or click it); press **Ctrl+Enter**
  on Windows / **Command+Enter** on Mac. The same location should be shown.
  Typing in search must not trigger the shortcut. Holding Enter must not repeatedly
  launch windows. Plain Enter retains normal expand/button behavior.
- An AI group with several locations must show a chooser. The shortcut opens the
  chooser and focuses its first choice; it must not silently pick a location.
- Move/remove a test item after scanning and click its action. A readable message
  is expected, and another valid item's action must remain usable.
- Confirm no file is launched and no delete/trash action is present. Check Mac
  Finder and its Command shortcut on a real device separately.

## Unlimited minimum-GB results

1. Scan a scope with more than 10,000 regular files/subdirectories. Open **Büyük
   öğeler**, enter a GB threshold and press **Uygula**. Counts must include all
   measured matches; each kind shows only 50 rows per page.
2. Page forward/back and check stable ordering for equal sizes, no repeated/missing
   paths, and that cards replace the previous page. Use **Klasörlere git** to jump
   to directory results without scrolling through all file cards.
3. Search for a file near the end of the complete catalog, including an item beyond
   the old 10,000 cutoff. Lower the GB threshold, use comma/dot decimals, clear it,
   and combine with path search. No operation should start another scan.
4. Change search/size quickly while queries load. Old responses must not overwrite
   newer results. Cancel result loading, verify cancellation stays in effect, then
   retry or change the filter. Next/Previous must remain usable afterwards.
5. Cancel an active filesystem scan. Partial status/warnings should remain clear,
   measured records should still be pageable, and a new scan should work. A new
   scan replaces the prior temporary catalog; stale result IDs must not reappear.
6. Confirm row **Klasörde göster**, Ctrl+Enter / Command+Enter still reveal exactly
   that row, including a result after the old cutoff.
7. Compare exact logical bytes. Exactly 5,000,000,000 bytes is included at 5 GB;
   one byte less is excluded even if display rounding says 5 GB. Folder/child
   sizes overlap. Inaccessible/link/unmeasured items are not claimed as complete.
8. Resize to 720 x 600, navigate by keyboard, then test real macOS Finder/APFS
   behavior separately. No delete/trash action should appear.

The app's own live temporary results directory is intentionally excluded from the
scan. Ordinary filesystem mutations/permission errors still yield partial results.


## Persistent exclusions and automatic protection

1. Expand **Hariç tutulanlar**, add two folders with **Klasör ekle…**, and cancel a
   second picker attempt. The saved list must remain intact after cancellation.
2. Close/reopen Roomit. Both selections should still be listed. Unplug/reconnect
   a removable drive: its saved exclusion must not disappear.
3. Scan a test parent containing an excluded subtree and an included sibling.
   Only the included bytes/results should appear; similar prefix names must stay
   included. All totals describe the included scope. Check **Tarama ayrıntıları**.
4. Try selecting an excluded child directly: Roomit should refuse to scan it.
   Repeat folder/disk/computer modes; exclusion choices apply to all three.
5. During scanning, add/remove controls are disabled; progress and cancel remain
   available. After a change, rescan for new results; prior results are labeled old.
6. **Listeden çıkar** only removes the preference. Verify the folder still exists;
   rescan and confirm it can now appear unless an automatic rule also protects it.
7. Expand the automatic list. Windows system/program paths and registered custom
   install paths must stay out, including direct selection of a child. AI models
   and project data outside those trees remain eligible.
8. On Mac, test `/Applications`, a `.app` moved into Downloads, direct selection
   inside that bundle, and real user data under `/System/Volumes/Data/Users`.
   System/app contents must stay excluded while ordinary user data is eligible.
