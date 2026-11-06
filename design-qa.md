# Roomit design QA — 2026-11-04

final result: passed

Scope: browser-rendered interface and mocked IPC interactions. This is a
functional desktop redesign, not a pixel clone of Sensei. Native executable
interaction and macOS acceptance are separate pending checks.

## Sources and evidence

- Visual source: https://cindori.com/_next/image?q=90&url=%2Fimages%2Fsensei%2Fdashboard-large.png&w=2408
- Source capture: `artifacts/qa/sensei-reference.jpg` (1280 x 720).
- Implementation: `artifacts/qa/roomit-overview.jpg` (1265 x 712 visible screenshot).
- Combined comparison: `artifacts/qa/design-comparison.jpg` (2560 x 764).
- Focused interaction evidence: `artifacts/qa/project-details.jpg` and
  `artifacts/qa/roomit-cancelled.jpg`.
- Responsive captures: `artifacts/qa/roomit-1120.jpg`, `roomit-720.jpg`.
- Browser: in-app browser. Default viewport 1280 x 720, also explicitly checked
  1120 x 820 and minimum 720 x 600 CSS viewports; overrides reset afterward.
  The browser screenshot surface fits overridden viewports within its canvas;
  responsive acceptance uses DOM geometry as well as the visible capture.
- Source and default implementation use the same 1280 x 720 browser surface.
  Scrollbar/screenshot visible-area differences are retained, not stretched.
  The reference depicts a Mac app inside a marketing image; Roomit is an
  unframed live web surface. No 1:1 pixel-match claim is made.
- State: completed single-disk scan, mocked data visibly labeled ORNEK in the
  header. The source is a hardware dashboard; only its navigation/card layout
  is the approved inspiration. All Roomit values are fixture data, not actual
  user disk measurements. The ignored `.local/qa` harness is never bundled.

## Findings and comparison history

1. P2: The expanded scan setup pushed report groups below the first screen.
   Fixed by automatically collapsing setup to a compact location/status summary
   once a report arrives. `Alani degistir` reopens it without rescanning.
   The combined board and final overview show visible metrics and the first
   project row above the fold. No actionable P0/P1/P2 finding remains.
2. The earlier green palette was replaced after user feedback with the selected
   graphite/electric-blue direction. Final palette is intentional, not drift.
3. A transient Vite edit reload hit an old ignored harness HTML without the new
   toggle element. Regenerating the harness HTML and reloading fixed it. Final
   interaction checks ran after this reload; it is not a production exception.

## Required surfaces

- Typography: native Segoe UI / Apple system family; distinct heading, metric,
  navigation, metadata and path sizes. Turkish labels render correctly. Long
  paths wrap in details and truncate in live progress.
- Layout: fixed left navigation, wide work surface, compact completed-scan panel,
  aligned three-card metrics. At 720 CSS px, document scrollWidth is 705 px;
  no horizontal overflow. Vertical scrolling is intentional. Small windows stack
  metrics, preserve navigation and keep setup actions reachable.
- Colors: neutral graphite surfaces, restrained blue selection/CTA/size emphasis,
  muted gray metadata and amber partial/error state. Keyboard focus has a blue
  outline. Selection also has border/radio/pressed state, not color alone.
- Assets: existing Roomit vector logo recolored; genuine MIT Phosphor SVG assets.
  No screenshot content or hardware imagery was copied into the product.
  Vite emits separate local image files to comply with the native strict CSP.
- Copy: actual folder/disk/computer scope, logical-byte labels, protected AI data,
  partial results and read-only status. No deletion or reclaimed-space promise.

## Interactions checked with mocked IPC

- Disk discovery alone does not scan. Selecting G: enables start and displays
  its own capacity; start receives exactly mode=disk and root=G:\.
- Active scan shows progress/cancel and disables scope/refresh controls.
- Cancel returns a partial report, lower-bound metrics and working controls.
- Completed report compacts setup; reopening it preserves selected disk.
- Projects navigation, debounced search for roomit and lazy group expansion show
  the expected target directory and its logical size.
- Unit/native tests separately verify actual root discovery, selection validation,
  traversal, cancellation and byte accounting. No real whole-disk scan was run.

## Remaining checks

- Windows native screen/picker acceptance by user; native UI launch via Computer
  Use was unavailable (`Computer Use was not approved to use roomit-design-test`).
  Browser verification was completed instead. No claim of native screen QA.
- Real macOS build/device acceptance for picker, volumes/APFS and layout.
- P3: optional future density preferences. No additional change needed for this scope.

Implementation checklist: visual pass, responsive pass, core interaction pass,
47 automated tests, Windows executable build and hash comparison.

## Reveal follow-up — 2026-11-04

This is a scoped functional addition, not a new visual direction. The existing
passed palette/layout review remains historical. Cards now carry a separate
visible reveal action outside their collapsed details content; nested file rows
have their own action. The keyboard hint is visible above results. Browser
fixture interaction evidence covers button target, nested keyboard target,
multiple locations and recovery after a failed request. Native Windows smoke
opened the fixture directory; Finder/native Roomit UI acceptance remains pending.

Reveal evidence: `artifacts/qa/reveal-locations.jpg` shows the multi-location
chooser and direct action on a collapsed card; `reveal-error.jpg` records a
visible missing-path message. A subsequent valid action succeeded and the
browser error log was empty. These screenshots use labeled sample data.

## Minimum-size follow-up — 2026-11-04

Scoped feature addition in the existing graphite/blue workspace. **Büyük öğeler**
now has an accessible minimum GB field, explicit Apply/Clear controls, validation,
filter summary and separate file/folder counts and lists. Unit/core checks cover
exact byte boundaries; the in-app browser fixture verified 5 GB and comma input
without rescanning, plus validation and clearing. Screenshot:
`artifacts/qa/size-filter-5gb.jpg`. This is sample-data evidence, not a real scan.

Additional size-filter evidence: a 999 GB filter produced both empty states;
5 GB plus path search retained only the matching ISO. Its reveal action worked
in the mock adapter. At 720 x 600 CSS px, document scrollWidth was 705 px and
all filter controls remained reachable (`artifacts/qa/size-filter-720.jpg`).
Scan invocation count stayed at one throughout. Final browser error log was empty.

## Unlimited result paging follow-up — 2026-11-04

The size view now reads all matches from a local temporary catalog, with 50 rows
per kind/page and no retained-result cutoff. File/directory counts are exact for
the measured catalog. Next/Previous replace cards; top/bottom controls and section
jumps remain usable. Browser fixture evidence verifies 10,123 matches of each
kind while rendering at most 100 cards, a second page starting at row 50, backwards
navigation, search beyond row 10,000, delayed-query rejection and query/scan cancel.
The last manual Apply/navigation cancels a pending search debounce; a cancelled
query stays cancelled. Native/core data and performance evidence is in VALIDATION.
This browser evidence uses sample data and does not certify native frame rates.

Browser evidence: `artifacts/qa/unlimited-results.jpg` shows 10,123 matches with
page controls and the second page. `unlimited-cancelled.jpg` records scan partial
state. At 720 x 600, document scrollWidth was 705 and only 100 result cards were
present. Overrides were reset; the final browser error log was empty. After scan
cancellation, a new scan and second-page navigation both worked.


## Persistent exclusions follow-up — 2026-11-04

Added a collapsed **Hariç tutulanlar** section in the existing graphite/blue scan
panel. User-selected paths, explicit remove-preference actions and an always-on
automatic protection section are distinct. The included-scope size explanation
stays visible when completed-scan settings collapse.

Browser mocked-IPC evidence: add two paths, cancel picker with no change, remove
one preference, reload retained choices, lock editing during scan, retain previous
choices on save failure and block scanning on load failure even after choosing a
folder. Native Rust persistence/traversal tests establish actual filesystem
behavior; the browser fixture does not. `artifacts/qa/exclusions.jpg` is labeled
sample data. The 720 x 600 layout had scrollWidth 705 with no horizontal overflow;
the viewport was reset and the temporary tab/server closed. Native Windows/Mac
screen acceptance remains separate.
