export interface RevealKey {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  isComposing: boolean;
}
export function isRevealShortcut(event: RevealKey, mac: boolean): boolean {
  return event.key === "Enter" && !event.altKey && !event.shiftKey && !event.repeat && !event.isComposing
    && (mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey);
}
