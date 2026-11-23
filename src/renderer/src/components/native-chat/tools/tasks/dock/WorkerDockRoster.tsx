import { useTranslate } from '@/i18n/use-translate'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { defaultRangeExtractor } from '@tanstack/react-virtual'
import { useNativeChatToolRunWindow } from '../../runs/use-native-chat-tool-run-window'
import { workerDockClearable } from '../../../../../../../shared/orchestration/dock/worker-dock'
import { WorkerDockRow, workerDockRowTitle, type WorkerDockRowView } from './WorkerDockRow'
import { useLatestHandler } from '@/lib/use-latest-handler'
import { cn } from '@/lib/class-names'
import { workerDockSummary } from './worker-dock-summary'
import { compareWorkerDockCardRows, workerDockGlyph } from './worker-dock-card-order'
import {
  workerDockAnchorIndex,
  workerDockRowKeyTarget,
  workerDockScrollAnchorAt,
  type WorkerDockScrollAnchor
} from './worker-dock-scroll-anchor'
import { WorkerDockCardFooter } from './WorkerDockCardFooter'
import {
  WORKER_DOCK_FLOAT_CLASS,
  WORKER_DOCK_SURFACE_CLASS,
  WorkerDockPill,
  useWorkerDockOutsidePress
} from './WorkerDockPill'

type Identity = {
  id: string
  state: WorkerDockRowView['state']
  changedAt?: number | null
  ownerActionsAvailable?: boolean
  settlement?: string | null
}

const ROW = 30
const MAX_ROWS = 6

/** The chat's open workers as one floating pill over the end of the transcript; pressing it opens
 *  a card of every worker above it. Nothing is drawn behind either, so the chat stays readable. */
export function WorkerDockRoster(props: {
  identities: readonly Identity[]
  countIdentities?: readonly { id: string; state: WorkerDockRowView['state']; kind?: string }[]
  rows: ReadonlyMap<string, WorkerDockRowView>
  visible: boolean
  stopAll?: { pending: boolean; onStop: () => void }
  expanded: boolean
  onExpandedChange: (value: boolean) => void
  pending: ReadonlySet<string>
  onOpen: (row: WorkerDockRowView, opener: HTMLElement) => void
  onAction: (row: WorkerDockRowView, action: 'stop' | 'clear') => void
  onClearAll: () => void
  loadWindow?: (anchor: string) => Promise<void>
}) {
  const t = useTranslate()
  const onOpen = useLatestHandler(props.onOpen)
  const onAction = useLatestHandler(props.onAction)
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const pill = useRef<HTMLButtonElement>(null)
  const anchor = useRef<WorkerDockScrollAnchor | null>(null)
  const sorted = useMemo(
    () =>
      [...props.identities].sort((a, b) =>
        compareWorkerDockCardRows(
          { ...a, retired: props.rows.get(a.id)?.retired },
          { ...b, retired: props.rows.get(b.id)?.retired }
        )
      ),
    [props.identities, props.rows]
  )
  const [held, setHeld] = useState<readonly Identity[] | null>(null)
  const current = useMemo(() => new Map(sorted.map((row) => [row.id, row])), [sorted])
  // A held order keeps rows from jumping under the pointer, but never keeps a row that left (a
  // cleared or finished worker goes at once) and never hides one that arrived (it joins the end).
  const items = useMemo(() => {
    if (!held) {
      return sorted
    }
    const kept = held.flatMap((row) => current.get(row.id) ?? [])
    const keptIds = new Set(kept.map((row) => row.id))
    return [...kept, ...sorted.filter((row) => !keptIds.has(row.id))]
  }, [held, sorted, current])
  if (
    held &&
    (held.length !== items.length || held.some((row, index) => row.id !== items[index].id))
  ) {
    setHeld(items)
  }
  const [focused, setFocused] = useState<string | null>(null)
  const clearing = props.identities.some(
    (row) => workerDockClearable(row) && props.pending.has(row.id)
  )
  const clearable = props.identities.filter(workerDockClearable).length
  const { mixed, total, count } = workerDockSummary(
    props.countIdentities ?? props.identities,
    props.rows,
    t
  )
  const small = items.length <= 30
  const activeIndex = useMemo(() => items.findIndex((row) => row.id === focused), [items, focused])
  const rowKeys = useMemo(() => items.map((item) => ({ key: item.id })), [items])
  const estimateSize = useCallback(() => ROW, [])
  const extractRange = useCallback(
    (range: Parameters<typeof defaultRangeExtractor>[0]) => {
      const indices = defaultRangeExtractor(range)
      return activeIndex >= 0 && !indices.includes(activeIndex)
        ? [...indices, activeIndex].sort((a, b) => a - b)
        : indices
    },
    [activeIndex]
  )
  const rowWindow = useNativeChatToolRunWindow({
    rows: rowKeys,
    scrollerRef: viewport,
    isVisible: props.visible,
    drawsEveryRow: small,
    estimateSize,
    rangeExtractor: extractRange,
    enabled: props.expanded && !small
  })
  const virtual = rowWindow.virtualizer
  const visibleItems = rowWindow.drawn
  // Six rows, or less when the chat above the pill is shorter: the card never runs off the pane.
  const [budget, setBudget] = useState(ROW * MAX_ROWS)
  const measure = useLatestHandler(() => {
    const pane = root.current?.closest('[data-native-chat-root]')?.getBoundingClientRect()
    const pillTop = pill.current?.getBoundingClientRect().top
    const footer = root.current?.querySelector<HTMLElement>('[data-worker-dock-footer]')
    if (!pane || pillTop === undefined) {
      return
    }
    const room = pillTop - pane.top - 8 - 10 - 8 - (footer?.offsetHeight ?? 0)
    setBudget(Math.max(ROW, Math.min(ROW * MAX_ROWS, room)))
  })
  useLayoutEffect(measure, [measure, props.expanded, items.length])
  const shown = items.length > 0
  useEffect(() => {
    const pane = root.current?.closest('[data-native-chat-root]')
    if (!pane || !props.expanded || typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(measure)
    observer.observe(pane)
    return () => observer.disconnect()
  }, [measure, props.expanded, shown])
  const close = useLatestHandler((refocus: boolean) => {
    setHeld(null)
    props.onExpandedChange(false)
    if (refocus) {
      pill.current?.focus()
    }
  })
  useWorkerDockOutsidePress(root, props.expanded, () => close(false))
  const top = sorted[0]
  const topRow = top ? props.rows.get(top.id) : undefined
  // The pill names a worker the host has not sent yet; ask for the window around it.
  const missingTop = top && !topRow ? top.id : null
  const { loadWindow } = props
  useEffect(() => {
    if (missingTop) {
      void loadWindow?.(missingTop)
    }
  }, [missingTop, loadWindow])
  const loadVisibleWindow = useLatestHandler(() => {
    const first = visibleItems.find((item) => item.end > (viewport.current?.scrollTop ?? 0))
    const key = first ? items[first.index]?.id : undefined
    if (key && !props.rows.has(key)) {
      void props.loadWindow?.(key)
    }
  })
  const firstVisibleKey = visibleItems[0]?.index
  useEffect(loadVisibleWindow, [firstVisibleKey, props.rows, loadVisibleWindow])
  const preserveAnchor = useLatestHandler(() => {
    if (!anchor.current || !viewport.current) {
      return
    }
    const saved = anchor.current
    const target = workerDockAnchorIndex(saved, items)
    if (target < 0) {
      return
    }
    const offset = small
      ? viewport.current.querySelector<HTMLElement>(`[data-index="${target}"]`)?.offsetTop
      : virtual.getOffsetForIndex(target, 'start')?.[0]
    if (offset !== undefined) {
      viewport.current.scrollTop = offset + saved.offset
    }
  })
  const identityOrder = items.map((row) => row.id).join('|')
  useLayoutEffect(preserveAnchor, [identityOrder, props.rows, preserveAnchor])
  const hold = () => setHeld((previous) => previous ?? sorted)
  const release = () => {
    if (!root.current?.contains(document.activeElement) && !root.current?.matches(':hover')) {
      setHeld(null)
    }
  }
  const focusRow = (index: number) => {
    const target = items[Math.max(0, Math.min(index, items.length - 1))]
    if (!target) {
      return
    }
    hold()
    const focusTarget = () =>
      viewport.current
        ?.querySelector<HTMLElement>(
          `[data-worker-dock-row="${CSS.escape(target.id)}"] [data-worker-dock-open]`
        )
        ?.focus()
    if (!small) {
      virtual.scrollToIndex(items.indexOf(target), { align: 'auto' })
      requestAnimationFrame(focusTarget)
    } else {
      focusTarget()
    }
  }
  // A row that leaves while it holds focus (Clear, say) hands focus to the row that takes its
  // place, to the pill, or to the message box once the pill is gone, never to the page.
  const lastFocus = useRef<{ id: string; index: number; pane: Element | null } | null>(null)
  useLayoutEffect(() => {
    const saved = lastFocus.current
    if (!saved || items.some((row) => row.id === saved.id)) {
      return
    }
    lastFocus.current = null
    const focusedNow = document.activeElement
    if (focusedNow && focusedNow !== document.body) {
      return
    }
    const next = items[Math.min(saved.index, items.length - 1)]
    const target = next
      ? viewport.current?.querySelector<HTMLElement>(
          `[data-worker-dock-row="${CSS.escape(next.id)}"] [data-worker-dock-open]`
        )
      : null
    ;(
      target ??
      pill.current ??
      saved.pane?.querySelector<HTMLElement>('[data-native-chat-composer-scope] textarea')
    )?.focus()
  }, [items])
  if (!shown || !top) {
    return null
  }
  return (
    <div
      ref={root}
      data-native-chat-background-tasks="true"
      data-worker-dock-float=""
      className={WORKER_DOCK_FLOAT_CLASS}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && props.expanded) {
          event.preventDefault()
          event.stopPropagation()
          close(true)
        }
      }}
    >
      {props.expanded ? (
        <div
          data-worker-dock-card=""
          className={cn(
            WORKER_DOCK_SURFACE_CLASS,
            'absolute inset-x-0 bottom-9 mx-auto flex w-[min(320px,calc(100%-24px))] flex-col rounded-[10px] p-1 shadow-floating animate-in fade-in-0 slide-in-from-bottom-1 duration-120 motion-reduce:animate-none'
          )}
          onPointerEnter={hold}
          onPointerLeave={release}
          onFocusCapture={(event) => {
            hold()
            const row =
              event.target instanceof Element
                ? event.target.closest<HTMLElement>('[data-worker-dock-row]')
                : null
            if (row) {
              const rowId = row.dataset.workerDockRow ?? null
              setFocused(rowId)
              lastFocus.current = rowId
                ? {
                    id: rowId,
                    index: items.findIndex((item) => item.id === rowId),
                    pane: row.closest('[data-native-chat-root]')
                  }
                : lastFocus.current
              row.scrollIntoView({ block: 'nearest' })
            }
          }}
          onBlurCapture={() =>
            queueMicrotask(() => {
              if (!root.current?.contains(document.activeElement)) {
                lastFocus.current = null
              }
              setFocused(
                document.activeElement?.closest<HTMLElement>('[data-worker-dock-row]')?.dataset
                  .workerDockRow ?? null
              )
              release()
            })
          }
        >
          <div
            ref={viewport}
            id={id}
            role="region"
            aria-label={t('components.native-chat.workerDock.workersRegion', 'Workers')}
            className="scrollbar-sleek min-h-0 overflow-y-auto overscroll-contain"
            style={{ maxHeight: budget }}
            onScroll={(event) => {
              anchor.current =
                workerDockScrollAnchorAt(
                  event.currentTarget,
                  small ? null : virtual.getVirtualItems(),
                  items
                ) ?? anchor.current
              hold()
            }}
            onKeyDown={(event) => {
              const row =
                event.target instanceof Element
                  ? event.target.closest<HTMLElement>('[data-worker-dock-row]')
                  : null
              const index = items.findIndex((item) => item.id === row?.dataset.workerDockRow)
              const next =
                index === -1 ? null : workerDockRowKeyTarget(event.key, index, items.length)
              if (next === null) {
                return
              }
              event.preventDefault()
              // The pill sits just below the card, so moving down past the last row lands on it.
              if (next >= items.length) {
                pill.current?.focus()
              } else {
                focusRow(next)
              }
            }}
          >
            <div style={{ height: small ? 'auto' : rowWindow.totalSize, position: 'relative' }}>
              {visibleItems.map((item) => {
                const identity = items[item.index]
                const row = props.rows.get(identity.id)
                return (
                  <div
                    key={identity.id}
                    data-index={item.index}
                    ref={small ? undefined : rowWindow.measureRow}
                    style={{
                      position: small ? 'relative' : 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: small ? undefined : `translateY(${item.start}px)`
                    }}
                  >
                    {row ? (
                      <WorkerDockRow
                        row={row}
                        mixed={mixed}
                        visible={props.visible}
                        pending={props.pending.has(row.id)}
                        onOpen={onOpen}
                        onAction={onAction}
                      />
                    ) : (
                      <div className="flex h-[30px] items-center px-2 text-xs text-muted-foreground">
                        {t('components.native-chat.workerDock.loadingWorker', 'Loading worker…')}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <WorkerDockCardFooter
            stopAll={props.stopAll}
            clearable={clearable}
            clearing={clearing}
            onClearAll={() => {
              props.onClearAll()
              pill.current?.focus()
            }}
          />
        </div>
      ) : null}
      <WorkerDockPill
        pill={pill}
        glyph={workerDockGlyph({ ...top, retired: topRow?.retired })}
        title={topRow ? workerDockRowTitle(topRow) : count}
        total={total}
        expanded={props.expanded}
        listId={id}
        onToggle={() => {
          setHeld(null)
          props.onExpandedChange(!props.expanded)
        }}
        onKeyDown={(event) => {
          if (props.expanded && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
            event.preventDefault()
            focusRow(event.key === 'ArrowUp' ? items.length - 1 : 0)
          }
        }}
      />
      <span className="sr-only" role="status" aria-live="polite">
        {count}
      </span>
    </div>
  )
}
