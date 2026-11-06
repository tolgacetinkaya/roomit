# Integrated desktop shell — 0.3.0

The supplied Codex screenshot is a structural reference: continuous dark chrome,
compact grouped navigation and a distinct scrolling workspace. Roomit keeps its
AI resource panels, storage map, name, icons and blue accent; it does not copy
chat, project trees, editor tabs or nonfunctional File/Edit menus.

- Windows: `decorations: false`, with OS shadow and resizing retained. The
  44px application titlebar contains a Roomit dropdown, sidebar toggle, current
  view and minimize/maximize/restore/close controls. Its context strip is the
  drag region; a double click toggles maximization. Buttons/menu are excluded.
- macOS: platform config uses `decorations: true`, `titleBarStyle: Overlay` and
  `hiddenTitle: true`; native traffic lights retain an 80px safe area. Custom
  Windows controls are hidden. A macOS build/device check is still required.
- Only four new permissions are granted to the existing main-window capability:
  minimize, toggle-maximize, close and start-dragging. Existing getter/event
  permissions suffice for resize/maximized-state updates. No file-write, shell
  or opener permissions were added.
- Sidebar visibility is stored under `roomit-sidebar-collapsed`. Ctrl+B or
  Command+B toggles it outside editable fields; the button always remains
  accessible. Menu closes on Escape/outside click and routes to existing views.
- A menu/sidebar scan action opens the existing configuration, without starting
  a scan. Busy-state restrictions mirror the existing New scan action. New-view
  navigation resets the workspace scroll; filtering/paging does not.
- Native window-action errors display a status message. Browser-only previews
  disable OS controls; mocked-IPC QA does not prove real native window behavior.

Validation: the full existing suite passed (117 tests; one ignored reveal smoke),
plus TypeScript/Vite and Windows Tauri compilation. Browser evidence covers
1280×860 and 720×600, sidebar persistence/keyboard toggle, menu navigation/Escape,
scan setup without scan, AI filtering and GPU sort; console errors were empty.
The final scroll fix was compiled in the final native build and exercised in the
browser. Native Computer Use launch approval timed out, so dragging, real window
resize/maximize/minimize/close, native OS border appearance and macOS remain
acceptance gaps. No native app was launched by that attempt.

Implementation follows Tauri's [window customization guide](https://v2.tauri.app/learn/window-customization/)
and the installed Tauri 2 API/config schema. macOS retains the native titlebar
functions described by that guide instead of removing the system chrome.

No deletion, automatic rescan, history reset or publication was added.
