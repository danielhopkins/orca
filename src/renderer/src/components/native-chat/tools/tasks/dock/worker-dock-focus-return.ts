/** The chat pane a dialog's opener sits in, read while the opener is still on screen. */
export function workerDockOpenerPane(opener: HTMLElement): Element | null {
  return opener.closest('[data-native-chat-root]')
}

/** Back to the row that opened a dialog, or, once that row is gone, its own pane's worker pill. */
export function returnWorkerDockFocus(opener: HTMLElement, pane: Element | null): void {
  if (opener.isConnected) {
    opener.focus()
  } else {
    pane?.querySelector<HTMLElement>('[data-worker-dock-pill]')?.focus()
  }
}
