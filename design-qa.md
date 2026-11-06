# Roomit 0.3.0 — desktop shell QA

final result: passed

Scope: **browser visual and interaction acceptance** for the requested Codex-like
shell adaptation. This is not native window-control or macOS acceptance.

## Comparison evidence

- Source visual truth: user attachment
  `C:/Users/Tolga/AppData/Local/Temp/codex-clipboard-c95b1352-3e63-42c8-9f29-141b846836ed.png`
  (3838×2082 pixels). Opened together with the implementation in the same image
  comparison input. Source file remains outside the repository.
- Implementation: `artifacts/qa/shell-control.png`, 1280×860 pixels, CSS viewport
  1280×860 at 1×; restored sample scan, AI control center, sidebar open, menu closed.
- Additional evidence: `artifacts/qa/shell-menu.png` (1280×860),
  `artifacts/qa/shell-narrow.png` (720×600), and
  `artifacts/qa/shell-activity.png` (1280×860, AI filter/GPU ordering, scrolled).
- The reference is a different app/content state, supplied for layout direction,
  not an exact screen clone. Pixel-for-pixel typography/content/state comparison
  would be misleading. Compare relative region proportions and chrome hierarchy:
  source sidebar is roughly one-sixth of width, Roomit sidebar 224/1280; a shallow
  topbar and independent content pane are preserved. No raster upscaling used.
- Focused evidence: dropdown/menu and 720px captures were inspected separately
  for readable controls, labels and clipping, in addition to the full-view
  source/implementation comparison. No source brand assets were copied.

## Findings and comparison history

1. [P2, fixed] Initial capture showed blue OS controls and sidebar scan button.
   Existing broad primary-button selectors overrode the neutral chrome. Primary
   colors moved into base button styles, preserving component-specific colors.
   The control/menu captures show the resulting neutral chrome and blue primary
   action only.
2. [P2, fixed] Initial 720px capture retained the previous setup scroll position,
   leaving the next view's heading partially obscured. New-view navigation now
   resets only the main pane scroll. Recapture `shell-narrow.png` reports main
   scrollTop 0 and heading y=64, below the 44px titlebar. Filter/page state is kept.
3. Final comparison found no remaining actionable P0/P1/P2 browser layout issues.
   Horizontal overflow check: at 720×600, main client/scroll widths both 530;
   titlebar scroll width 720. At 1280×860 collapsed, main widths both 1270.

## Required fidelity surfaces

- Typography: existing Segoe UI/system stack retained; 11–12px navigation,
  25px headings and restrained weights support the reference's desktop density.
  Narrow-window labels wrap without hiding navigation or window buttons.
- Spacing/layout: 44px titlebar, grouped 224px sidebar (180px at narrow widths),
  independent scrolling main/sidebar, compact 36px rows; selected navigation
  stays clear. The product's map and resource widgets remain intentionally.
- Colors/tokens: graphite surfaces with restrained electric blue; no new theme
  or copied Codex purple. Subtle pane dividers replace heavy outer chrome.
- Assets: original Roomit logo, local product logos and installed Phosphor SVG
  icons. No generated raster assets were needed; no screenshot used as UI.
- Copy: Roomit-specific AI/file categories; real functional commands only.
  Sample IPC values are explicitly marked “ÖRNEK VERİ” in the wide preview.

## Interaction and validation

- Sidebar toggle, Ctrl+B and persistence across reload passed.
- Roomit menu open, Escape close and menu-to-resources navigation passed.
- New scan opens setup with zero scan invocations; navigation starts no scan.
- Existing AI-only filtering and GPU ordering passed in the revised shell.
- Final browser console errors: none. Temporary viewport override reset.
- Existing automated suite: 117 passed, one ignored native reveal smoke.
  Initial sandbox run could not create a Windows junction; the full rerun under
  normal user access passed. Final native build includes presentation/scroll fixes.

## Remaining acceptance gaps

- Real Windows window controls, dragging/resizing and native frame appearance:
  Computer Use app launch approval timed out. Do not infer native acceptance
  from browser mocks, compiled permissions or an executable's GUI subsystem.
- Native macOS overlay and traffic-light layout: build/device untested.
- P3: tune density after feedback on the native desktop at the user's DPI scale.

Implementation checklist: browser comparison fixes applied; console checked;
existing suite passed; native build produced; native acceptance explicitly pending.
