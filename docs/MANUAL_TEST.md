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


## Last saved scan and freshness

1. Use this build to complete a scan, close Roomit and reopen the same exe. The
   previous groups and full file/folder lists should appear without a new walk.
   Older builds did not save their in-memory scans; perform one new scan first.
2. Check **Kaydedilen tarama sonuçları**, the scan start date and the notice that
   files may have changed. Apply the GB filter, search and page past 10,000 entries
   without rescanning. Reveal and its shortcut should still validate live paths.
3. Change files outside Roomit. Saved results remain historical; this version does
   now watches included changes while open. Confirm **Sonuçlar güncel değil**
   appears, then press **Yeniden tara** to measure using current exclusions. Ensure the date refreshes.
4. Cancel a scan, reopen and verify explicit cancelled/partial labels. Disconnect
   a scanned disk, reopen and inspect the saved data. Rescan should ask for an
   available target, with no automatic fallback to all disks.
5. Verify failure states in a disposable test profile: a broken saved record
   shows a recovery message, and a failed new scan/save preserves the previous
   disk record. Do not modify a user's actual saved data for this test.


## While-open change detection

1. Scan a small test parent with one included subtree and one excluded subtree.
   Create/edit/rename/remove a disposable included file in Explorer/Finder.
   Within a few seconds, **Sonuçlar güncel değil** should appear. No progress
   indicator or automatic rescan should start; result counts/sizes stay historical.
2. Keep the GB filter, path search and a later page open when the event arrives.
   Those controls and page rows must remain intact. Switching views must not
   clear the warning.
3. Rescan manually, then change only a file inside the excluded subtree. Normal
   excluded activity should not produce a change warning. Standard protected
   system/install roots and app-owned result/settings writes are excluded too.
4. Rename the scanned root or unplug its disk. The UI should report a change or
   an inability to monitor; it must not claim current results or scan another disk.
5. Press **Yeniden tara**. A completed replacement resets the previous warning;
   a mutation during the new walk may correctly make that replacement stale too.
6. Close Roomit, change a file, then reopen. There was no monitoring while closed;
   the saved report must keep its offline caveat. While-open flags are session-only.
7. On Mac, repeat with native FSEvents and verify privacy/access errors are explicit.
   Do not use browser fixture behavior as native Mac acceptance evidence.


## AI navigation regression and targeted action

1. Select **AI araçları** on the left, then **AI klasörlerini tara**. Do not choose
   **Bütün bilgisayar** for this test. Only the four supported per-user AI data
   roots should be measured. Check actual paths and sizes in the resulting cards.
2. AI must stay selected at start and after completion. Start again and cancel;
   AI must remain selected and results must be marked partial. Navigating to a
   different tab during a scan should keep that chosen tab when the result arrives.
3. Close/reopen after an AI scan. Its saved result should open in AI view without
   starting another scan or loading all disk choices. Manual rescan uses AI scope.
4. User exclusions still apply. Custom AI directories on other disks/project roots
   require a folder scan. Missing supported directories must not start a broader
   scan. Histories, settings and models must not be called temporary by default.

## AI-first interface refresh

1. Without a saved result, AI tools opens first with **AI klasörlerini tara**.
   **Klasör veya disk seç** opens scope settings. Selecting a folder/disk alone
   must not start a scan or erase the current report.
2. During a scan, elapsed time, current path and cancellation stay visible.
   Cancelled results remain partial and preserve the selected navigation view.
3. Compare AI totals and tool cards; sort by size/name and search a path/tool.
   Inspect details and **Klasörde göster**, including multi-location choices and
   Ctrl+Enter (Windows) / Cmd+Enter (Mac).
4. Open **Yeni tarama**, change scope, then **Kapat**. Existing search, expanded
   tool details, GB filter and later size-results page should remain intact.
   Keyboard focus returns to **Yeni tarama**.
5. Check at the default 1120 x 820 window and a narrow 720 x 600 window. Controls
   must stay reachable by scrolling, with no horizontal overflow. Check both
   empty and saved-result states, including stale/partial/error notices.
6. Browser sample-data previews verify layout/flow only. Repeat actual picker,
   scan, cancel and file-manager behavior in the native application on each OS.
