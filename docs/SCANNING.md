# Scanning, sizes and saved results

Implementation details and measurement limits for Roomit. For the product overview,
see the [README](../README.md); for app-scoped scans, see [app data scans](APP_DATA_SCANS.md).

## Size semantics and limits

Sizes are **logical bytes**, not allocated disk space or reclaimable space.
Hardlinked files count once per encountered path. Sparse/compressed files and
filesystem clones may occupy different physical space. Directory totals overlap
child rows; use the report root total, not a sum of displayed rows.
Totals measure the included scope, excluding pruned data; they are not full sizes
of folders containing excluded children. Recognized
space counts nested findings only once.

Skipped links, inaccessible entries and cancelled scans make sizes partial lower
bounds. All desktop scopes (folder, one disk, computer) have no entry/depth cutoff.
The library retains configurable traversal budgets for other callers. A live
filesystem scan is not an atomic snapshot or proof that an item can be removed.

The desktop streams every measured file/subdirectory into an app-owned local
SQLite index. The size view has **no 10,000-result cap** and requests only 50 rows
per file/directory page. Changing GB size or search queries the existing index;
there is no rescan. Progress, scan cancellation and result-loading cancellation
are available. Cancelled scans retain the metadata measured so far. The selected
root is summarized separately; links and the running app's own result directory
are excluded. The latter also has a macOS APFS Data alias exclusion.

Scanned user files remain unchanged. The index stores paths, types and sizes on
the local device. Successful scans (including cancelled/partial results) persist
under Tauri's per-user app local data folder in `last-scan`. Normal app shutdown
keeps the current result; a successful replacement retires the previous index
once its readers finish. Failed scans/saves preserve the previous saved result.
Write failures are displayed, and unsaved current results are labeled temporary.
Available local disk space bounds storage.
No full-result array is kept in the UI. SQLite page caches are configured to
4 MiB per connection; this is not a total process-memory guarantee.

Development/AI summaries still retain 10,000 findings/projects each, plus 100
legacy largest entries and 100 warnings. These summary limits do not limit the
size index or stop traversal. Progress is throttled to about 100 ms, and only one
desktop scan can run at once.
Byte counts are u64 in Rust and decimal strings in JSON/IPC to preserve precision
in JavaScript. The UI uses decimal units: 1 GB = 1,000,000,000 bytes.

## Folder and computer targets

Use **Choose folder…** to open the native directory picker. Cancelling keeps the
previous selection. Selection alone does not start scanning. Manual path typing
is no longer needed.

**Whole computer** previews detected local fixed/removable disk roots. Network
volumes are not included. The scan starts only when **Start scan** is pressed;
roots are refreshed at start. **Refresh disks** refreshes the preview.

Computer scans share one worker, cancellation token, bounded
largest-item list and cumulative progress across roots. Failed and unscanned
roots are listed. The user's home branch/volume is preferred where possible.
Overlapping requested roots are partitioned to avoid duplicate measurement.
On Unix, volume crossings are skipped; macOS APFS System and Data are separate
roots, avoiding traversal through Data firmlinks from the System tree. These
skips conservatively mark totals partial. Native Mac behavior awaits testing.

Normal OS permissions apply; the app does not request elevation. Inaccessible
areas, mount boundaries and entry limits yield partial results. Whole-computer
mode is not a guarantee that every protected/hidden volume can be inspected.

## Grouped results

The sidebar separates the AI workspace from file inspection. Overview, Projects,
AI storage map, Large items and Scan details expose different views of the latest
scan; result search is available where applicable. Software findings are grouped by nearest project,
AI locations by tool, and other protected data in a collapsed secondary section.
Individual paths and reasons are built lazily when a group is opened. Lists are
paged, so large reports do not create thousands of initial DOM rows.

Nested directory findings are counted once before grouping. Group bytes are
recognized artifact/data totals, not complete project sizes or reclaimable
space. If the retained report was truncated, group sizes are explicitly lower
bounds. Root scan totals still account for all measured files, independently
of output-list retention. Whole-computer scanning stops on cancellation, access
failures for particular subtrees, or OS errors, never because of an item/depth
budget. Existing link/mount partition rules continue to apply.

## Persistent exclusion settings

Choices are saved in `scan-exclusions.json` in Tauri's per-user app configuration
folder (`dev.roomit.desktop`), independently of the temporary scan index. Saving
uses an atomic same-directory replacement. Disconnected/missing paths stay saved.
Unreadable/corrupt settings block scanning instead of silently ignoring choices.
Only Roomit's own settings and temporary result metadata are written; scanned
files are untouched. Changes apply to subsequent scans; editing is locked while
scanning. Windows registry locations are read-only and refreshed each scan.

System/install rules intentionally preserve project directories and AI user data
outside protected installation trees. Files stored inside an excluded installation
remain excluded even if they look like project/AI data. On macOS, APFS Data user
paths remain eligible; system subtrees and their Data aliases are protected.

## Saved results and freshness

The report and complete SQLite index are stored together in one versioned local
generation. A small `current.json` pointer changes atomically only after the data
commits. New scans do not overwrite the old generation in place. Startup reads
only the saved report/schema; result rows are still loaded in 50-row pages.
Corrupt/missing/unsupported records show a recovery message and are preserved.
No saved result means the normal empty screen; nothing is scanned automatically.

Snapshots contain paths, classifications and sizes, not scanned file contents.
Their timestamp is the scan's start time. While the app is open, native filesystem
notifications detect included changes and latch a stale warning until a new scan.
Notifications do not update sizes or results. Offline changes are still unknown;
restored results retain a separate possible-change notice. **Rescan** uses the saved scope and
current exclusions; a missing disk prompts for a target instead of scanning all
disks. Existing reveal actions validate the path against the live filesystem.

## Change monitoring

Windows uses overlapped ReadDirectoryChangesW with one recursive handle per scan
root plus non-recursive parent watches to detect root rename/replacement. macOS
uses notify's FSEvents backend. No periodic file enumeration or content hashing
is used. The UI reads the small monitoring status every two seconds and changes
only the notice, preserving open filters/pages. This is best-effort monitoring:
permissions, disconnected roots or dropped event batches produce an explicit
uncertainty warning instead of a claim that results are current.

Watchers arm before a new scan, so included mutations during the scan can also
invalidate the resulting report. Failed replacement scans keep the previous
monitor. New saved reports retain their exclusion policy; older saved reports
remain readable and use the current policy as a compatibility fallback. The
app-owned settings/index trees, standard system/install exclusions and app-bundle
rules are filtered before invalidation. Windows access-only activity is ignored.
Monitoring is session-only: no background service or observation while closed,
and observed-change flags are not a durable filesystem journal.

The targeted AI action measures known tool data; histories, settings and models
are not automatically classified as disposable temporary files. A dedicated
AI temporary-file classifier remains incomplete. System/install exclusions,
progress/cancel, persisted results and live change warnings also apply in AI scope.
