# Manual screen checks — recursive scanning

The current UI has not been visually/native-tested by the agent in this change.
The user will run these checks. This is a checklist, not recorded acceptance.

## Start

1. Run `scripts/dev.ps1` from the repository root on Windows, or open the newly
   built `target/debug/roomit.exe`. A previously running app may be the old build;
   close it yourself before opening the updated executable.
2. Select a project parent directory by entering its absolute path. Start with a
   modest directory, not the whole drive. Press **Taramayı başlat**.
3. Observe file/folder counters, a changing path and an indeterminate progress
   indicator. No percentage is claimed because the total work is initially unknown.

## Results

- Confirm nested project markers are found, not just direct children.
- Open the project list; paths should identify the actual nested projects.
- Development findings should include a reason, folder/file kind, size and
  **İnceleme gerekli**. AI data/settings/models should show **Korunuyor**.
- Switch between all, software, AI and protected filters.
- Expand the largest file/folder list. Sizes include descendants; parent/child
  rows overlap and must not be added together.
- Compare logical totals with a tool that reports file lengths rather than
  allocated disk usage. Hardlinks/sparse/compressed files can differ physically.
- If the result list is large, test **Sonraki öğeleri göster**. Initial rendering
  should contain at most 100 rows per list.

## Cancellation and errors

- Start a sufficiently large scan, press **İptal et**, then wait for the partial
  report. A synchronous OS directory read may take time to return.
- Check that partial sizes say **En az … / kısmi**, then start another scan.
- Enter a missing path and a file path; the error should appear and controls
  should become usable again. Old results should not remain under a failed scan.
- A tree with links, inaccessible directories or depth/entry bounds should
  report skipped items and partial sizes, not claim a complete measurement.
- Confirm there are no delete/trash controls and that no source/config/AI data
  changes after scanning.

## Platform status

Windows compilation and automated tests are recorded in `VALIDATION.md`.
The updated native UI flow and visual state await user checks. macOS build,
links/permissions, progress, cancellation and native layout require a real Mac;
a Windows build does not count as that validation.
