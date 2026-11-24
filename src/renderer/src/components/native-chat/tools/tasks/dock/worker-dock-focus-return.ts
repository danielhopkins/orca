/** The chat pane a dialog's opener sits in, read while the opener is still on screen. */
export function workerDockOpenerPane(opener: HTMLElement): Element | null {
  return opener.closest('[data-native-chat-root]')
}

/** Back to the row that opened a dialog; once that row is gone, its own pane's worker pill; once
 *  the last worker left too, that pane's message box. Never another pane, never the page. */
export function returnWorkerDockFocus(opener: HTMLElement, pane: Element | null): void {
  const target = opener.isConnected
    ? opener
    : (pane?.querySelector<HTMLElement>('[data-worker-dock-pill]') ??
      pane?.querySelector<HTMLElement>('[data-native-chat-composer-scope] textarea'))
  target?.focus()
}
