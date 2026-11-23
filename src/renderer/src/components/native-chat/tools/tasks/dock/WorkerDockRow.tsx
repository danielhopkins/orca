import { useIntlLocale, useTranslate } from '@/i18n/use-translate'
import { workerDockKindLabel, workerDockStateLabel } from './worker-dock-labels'
import { memo } from 'react'
import { ArrowRight } from 'lucide-react'
import { WorkerDockRowAction } from './WorkerDockRowAction'
import { WorkerDockGlyph } from './WorkerDockGlyph'
import { workerDockGlyph } from './worker-dock-card-order'
import { useNowSnapshot } from '@/lib/window-activity/use-now'
import { formatShortTimeAgo } from '@/lib/time-format/short-time-ago'
import type { WorkerDockEntry } from '../../../../../../../shared/orchestration/dock/worker-dock'

export type WorkerDockRowView = WorkerDockEntry & {
  retired?: boolean
  providerId?: string
  /** The open question a needs-you worker asked: the row's title while it waits. */
  question?: string
}

/** What a row and the pill call the worker: its question while it waits on you, else its title
 *  once (the ticket name stays in the tooltip, so it is never repeated in front of the title). */
export function workerDockRowTitle(row: WorkerDockRowView): string {
  return (row.state === 'needs-you' && row.question) || row.title || row.name
}

function Age({ at, visible }: { at: number | null; visible: boolean }) {
  const locale = useIntlLocale()
  const label = useNowSnapshot(
    30_000,
    (now) => (at === null ? '' : formatShortTimeAgo(at, now)),
    visible && at !== null
  )
  return at === null ? null : (
    <span
      className="shrink-0 text-xs tabular-nums text-muted-foreground"
      title={new Date(at).toLocaleString(locale)}
    >
      {label}
    </span>
  )
}

/** One 30px card row: status mark, title, time, then Stop or Clear and an arrow on hover or focus.
 *  The open button stretches over the whole row, so a press anywhere but the action opens it. */
export const WorkerDockRow = memo(function WorkerDockRow({
  row,
  mixed,
  visible,
  pending,
  onOpen,
  onAction
}: {
  row: WorkerDockRowView
  mixed: boolean
  visible: boolean
  pending: boolean
  onOpen: (row: WorkerDockRowView, opener: HTMLElement) => void
  onAction: (row: WorkerDockRowView, action: 'stop' | 'clear') => void
}) {
  const t = useTranslate()
  const title = workerDockRowTitle(row)
  // An unreadable state has no label anywhere: the row reads as its title and time only.
  const state = row.retired
    ? t('components.native-chat.workerDock.doneResult', 'Done · open result')
    : row.state === 'unavailable'
      ? ''
      : workerDockStateLabel(t, row.state)
  // A remote chat's worker is shown, not driven, here: its label says where to act instead.
  const remote =
    row.kind === 'worker' && row.ownerActionsAvailable === false
      ? t(
          'components.native-chat.workerDock.remoteOwner',
          'Stop or clear this from the computer it runs on'
        )
      : ''
  const reason =
    (row.state === 'failed' || row.state === 'unexpected' || row.state === 'stopping') && row.reason
      ? row.reason
      : ''
  const label = [mixed ? workerDockKindLabel(t, row.kind) : '', title, state, reason, remote]
    .filter(Boolean)
    .join(' · ')
  const tooltip = [row.name, title === row.title ? '' : row.title, title, state, reason, remote]
    .filter(Boolean)
    .join(' · ')
  return (
    <div
      data-worker-dock-row={row.id}
      data-worker-dock-state={row.state}
      className="group/worker relative flex h-[30px] min-w-0 items-center gap-1 rounded-md pr-2 text-foreground hover:bg-accent has-focus-visible:bg-accent"
    >
      <button
        type="button"
        data-worker-dock-open={row.id}
        aria-label={label}
        title={tooltip}
        className="flex h-full min-w-0 flex-1 items-center gap-2 pl-2 text-left text-sm after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
        onClick={(event) => onOpen(row, event.currentTarget)}
      >
        <WorkerDockGlyph glyph={workerDockGlyph(row)} />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <Age at={row.changedAt} visible={visible} />
      </button>
      <WorkerDockRowAction row={row} pending={pending} onAction={onAction} />
      <ArrowRight
        aria-hidden="true"
        data-worker-dock-arrow=""
        className="pointer-events-none size-3 shrink-0 text-muted-foreground opacity-0 group-hover/worker:opacity-100 group-has-focus-visible/worker:opacity-100"
      />
    </div>
  )
})
