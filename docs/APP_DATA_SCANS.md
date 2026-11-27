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

The Windows storage preview adds **Local data by type** to the Codex and Claude
Code cards. It counts file lengths within the tool's detected roots. Known
session transcripts and input history contribute to Chats. Claude project
transcripts also have a per-project subtotal. Known log locations, debug files
and cache directories have their own rows. Other files includes everything
else measured in those roots. Each populated row can reveal its locations.
Category sizes cover the latest scan. A category with incomplete coverage is
labeled partial.

**Overview** and **AI storage map** show changes in scan-root totals, immediate
subfolders, project dependencies and tool categories. Comparison uses the last
finished scan with matching scope, tool, roots and exclusions among the eight
most recent scopes. Partial snapshots only supply comparable measurements.
Cancelled scans preserve the previous baseline. These rows can overlap.

**Possible model copies** groups nonempty GGUF, safetensors, ONNX and Ollama
model blobs by size within the current scan. File identities collapse hardlink
aliases. Select **Verify contents (SHA-256)** to read and compare one group.
Changed, excluded and inaccessible files are skipped. Verification can be
cancelled. Verified groups describe the contents observed during that check.

Category scans use names, locations and filesystem metadata. Existing exclusions, protected
data rules, cancellation, progress and stale-result monitoring continue to apply.
These sizes do not establish whether data is unused or safe to delete. No deletion
action is available.

Development changes use a feature branch and pull request targeting `main`.
Opening a PR does not merge it or publish a release. Release packaging follows
review and merge as a separate step.
