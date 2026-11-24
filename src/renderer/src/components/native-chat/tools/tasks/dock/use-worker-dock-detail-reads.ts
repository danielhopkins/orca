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
  // A roster change resets the budget, but a read still running keeps its place: it is the same
  // request, and its reply (or its failure) is what frees the anchor for the next one.
  useEffect(() => {
    reads.current = new Map(
      [...reads.current].flatMap(([anchor, read]) =>
        read.pending ? [[anchor, { tries: 1, pending: true }] as const] : []
      )
    )
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
          // The entry may have been carried into a new roster's map; free whichever holds it.
          const current = reads.current.get(anchor)
          if (current) {
            current.pending = false
          }
        })
    },
    [loadWindow]
  )
}
