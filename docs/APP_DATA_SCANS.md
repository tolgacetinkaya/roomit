# Per-application AI data scans

In **Your AI tools**, choose **Scan app data** on a tool card to scan only that
tool's known user-data locations. Alternatively, open **New scan**, select the AI
scope, and choose a tool under **AI application**. **All AI tools** retains the
combined scan. Choosing a dropdown option alone does not start a scan.

The card shows the measured total after completion; **View scanned data** opens
the AI storage map. The scan header and saved-results banner identify the scope.
The application selection is saved with the latest report and reused by Rescan,
including after restarting Roomit. As with other scan types, each successful or
cancelled scan replaces the single latest saved report. A failed scan preserves
the previous report. Partial results are explicitly labeled.

The native backend resolves a catalog tool ID to known data locations, without
walking other disks or searching every home subfolder. Unknown IDs fail instead
of falling back to all tools. Missing data locations produce an actionable error.
Overlapping roots within a scan are deduplicated. A known data root can contain
data used by another tool; these are location totals, not exclusive ownership.

Custom model directories, environment-variable overrides and project-local tool
data outside these known roots are not discovered by this scope. Use a folder
scan to inspect them. An installed tool can have no known data yet.

Scans read filesystem metadata, not file contents. Existing exclusions, protected
data rules, cancellation, progress and stale-result monitoring continue to apply.
These sizes do not establish whether data is unused or safe to delete. No deletion
action is available.

Development changes use a feature branch and pull request targeting `main`.
Opening a PR does not merge it or publish a release. Release packaging follows
review and merge as a separate step.
