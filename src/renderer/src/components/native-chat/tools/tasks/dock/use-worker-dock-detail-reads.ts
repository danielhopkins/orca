import { useCallback, useEffect, useRef } from 'react'

const MAX_TRIES = 3

/** Asks the host for the details window around a row: never twice at once, and at most three
 *  times per roster change, so a failed read can be retried (a key press, a scroll) but a row the
 *  host never sends cannot loop. */
export function useWorkerDockDetailReads(
  identities: unknown,
  loadWindow: ((anchor: string) => Promise<void>) | undefined
): (anchor: string) => void {
  const reads = useRef(new Map<string, { tries: number; pending: boolean }>())
  useEffect(() => {
    reads.current = new Map()
  }, [identities])
  return useCallback(
    (anchor: string) => {
      const read = reads.current.get(anchor) ?? { tries: 0, pending: false }
      if (!loadWindow || read.pending || read.tries >= MAX_TRIES) {
        return
      }
      read.tries++
      read.pending = true
      reads.current.set(anchor, read)
      void loadWindow(anchor)
        .catch(() => {})
        .finally(() => {
          read.pending = false
        })
    },
    [loadWindow]
  )
}
