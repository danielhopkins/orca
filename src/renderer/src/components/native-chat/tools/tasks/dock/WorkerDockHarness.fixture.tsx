import { useEffect, useMemo, useState } from 'react'
import { useLatestHandler } from '@/lib/use-latest-handler'
import { useWorkerDockOwnerActions } from './use-worker-dock-owner-actions'
import {
  WorkerDockAcknowledge,
  WorkerDockStop
} from '../../../../../../../shared/orchestration/dock/worker-dock'
import type { AgentSessionBackgroundTask } from '../../../../../../../shared/agent-session/background-tasks/agent-session-background-task-wire'
import { defineFixture } from '../../../../../component-fixtures/component-fixture'
import { workerDockFixturePane } from './worker-dock-pane-fixture'
import { NativeChatBackgroundTasksStatus } from '../NativeChatBackgroundTasksStatus'
import type { WorkerDockRowView } from './WorkerDockRow'

// A live strip for the rendered interaction suite (tests/tools/worker-dock-rendered): it keeps its
// own open state and answers Stop, Clear and Clear all the way the host does, a moment later.
const LOCAL = { kind: 'local' } as const
const SOURCE = '6c3f8e4a-ad5b-4a9c-9e37-2f4d8a0b3c59'
const TITLES = [
  'Fix streaming journal amplification',
  'Fix repeated worktree catalog scans',
  'Cache the branch list per repository',
  'Drop the duplicate status poll',
  'Batch the sidebar badge writes',
  'Stream the diff instead of buffering it',
  'Reuse the parsed config between tabs',
  'Coalesce terminal resize events',
  'Skip hidden pane layout passes',
  'Index session history by worktree',
  'Defer the plugin manifest scan',
  'Trim the startup font preload',
  'Share one watcher per repository',
  'Avoid re-sorting the unchanged roster',
  'Split the dock read model',
  'Bound the activity refresh',
  'Drop the second layout read',
  'Keep the composer height stable',
  'Collapse duplicate wakes',
  'Name the answering turn'
]

type WorkerDockHarnessEvent = {
  action: 'remote-stop' | 'stop-all' | 'stop' | 'clear' | 'clear-all' | 'open' | 'restore'
  id: string
}
type HarnessApi = {
  events: WorkerDockHarnessEvent[]
  start: (title: string) => void
  finish: (id: string) => void
}
function worker(index: number, state: WorkerDockRowView['state'], remote: boolean) {
  const at = Date.now() - (index + 2) * 60_000
  const failed = state === 'failed' || state === 'unexpected'
  return {
    kind: 'worker',
    id: `dock:${index}`,
    dispatchId: `ctx_fixture_${index}`,
    source: SOURCE,
    name: `ORCA-${30 + index}`,
    title: TITLES[index % TITLES.length],
    model: 'gpt-6.1-sol',
    state,
    changedAt: at,
    startedAt: at,
    reason: failed ? 'Typecheck failed: 3 errors in worker-dock-read.ts' : null,
    settlement: failed ? `settled:ctx_fixture_${index}` : null,
    resultId: failed ? `result:ctx_fixture_${index}` : null,
    stoppable: state === 'running',
    ownerActionsAvailable: !remote
  } satisfies WorkerDockRowView
}

const LONG_TITLE =
  'Fix-forward: bind the listing to the resolver so a renamed branch keeps its open pull request and review comments'

type Seed = { ask?: boolean; variety?: boolean; long?: boolean }
function seed(count: number, failed: number, remote: boolean, options: Seed): WorkerDockRowView[] {
  return Array.from({ length: count }, (_, index) => {
    const row = worker(index, index < failed ? 'failed' : 'running', remote)
    const title = options.long && index % 2 === 0 ? `${LONG_TITLE} (${index + 1})` : row.title
    // The newest running worker asks a question: it outranks the failures in the pill and card.
    if (options.ask && index === failed) {
      return {
        ...row,
        title,
        state: 'needs-you' as const,
        changedAt: Date.now() - 30_000,
        question: 'Approve: run the migration against the staging copy of the orders database?'
      }
    }
    if (options.variety && count >= 3 && index === count - 1) {
      return { ...row, title, state: 'idle' as const, stoppable: false }
    }
    if (options.variety && count >= 4 && index === count - 2) {
      return { ...row, title, state: 'coordinator' as const }
    }
    return { ...row, title }
  })
}

function Harness({
  count,
  failed,
  remote = false,
  open = false,
  command = false,
  stopAll = false,
  ...options
}: {
  count: number
  failed: number
  remote?: boolean
  open?: boolean
  command?: boolean
  stopAll?: boolean
} & Seed) {
  const [rows, setRows] = useState(() => seed(count, failed, remote, options))
  const [tasks, setTasks] = useState<AgentSessionBackgroundTask[]>(() =>
    command
      ? [{ id: 'shell-fixture', kind: 'command', description: 'Check the build', state: 'working' }]
      : []
  )
  const [expanded, setExpanded] = useState(open)
  const [events] = useState<WorkerDockHarnessEvent[]>(() => [])
  useEffect(() => {
    let next = count
    const api: HarnessApi = {
      events,
      start: (title) => {
        const row = { ...worker(next++, 'running', remote), title }
        setRows((current) => [row, ...current])
      },
      finish: (id) => setRows((current) => current.filter((row) => row.id !== id))
    }
    Object.assign(window, { __workerDockHarness: api })
    return () => {
      Reflect.deleteProperty(window, '__workerDockHarness')
    }
  }, [count, events, remote])
  const [cleared] = useState(() => new Map<string, WorkerDockRowView>())
  const record = (event: WorkerDockHarnessEvent) => events.push(event)
  const rpc = useLatestHandler(
    async ({ method, params }: Parameters<typeof window.api.runtime.call>[0]) => {
      if (method === 'orchestration.workerDockAcknowledge') {
        const { settlements, acknowledged } = WorkerDockAcknowledge.parse(params)
        const ids = new Set(settlements.map((item) => item.dispatchId))
        record({
          action: acknowledged ? (ids.size > 1 ? 'clear-all' : 'clear') : 'restore',
          id: settlements.map((item) => item.dispatchId).join(',')
        })
        if (acknowledged) {
          for (const row of rows) {
            if (ids.has(row.dispatchId)) {
              cleared.set(row.dispatchId, row)
            }
          }
          setRows((current) => current.filter((row) => !ids.has(row.dispatchId)))
        } else {
          const restored = [...ids].flatMap((id) => cleared.get(id) ?? [])
          setRows((current) => [...restored, ...current])
        }
      } else if (method === 'orchestration.workerDockStop') {
        const { dispatch } = WorkerDockStop.parse(params)
        const row = rows.find((item) => item.dispatchId === dispatch)
        if (row) {
          record({ action: 'stop', id: row.id })
          setRows((current) => current.filter((item) => item.id !== row.id))
        }
      }
      return { id: 'dock-fixture', ok: true as const, result: {}, _meta: { runtimeId: 'fixture' } }
    }
  )
  useEffect(() => {
    const previous = window.api.runtime.call
    window.api.runtime.call = rpc
    return () => {
      window.api.runtime.call = previous
    }
  }, [rpc])
  const identities = useMemo(
    () => rows.map((row) => ({ ...row, hasModel: Boolean(row.model) })),
    [rows]
  )
  const owner = useWorkerDockOwnerActions(LOCAL, `orca_session_id:${SOURCE}`, identities, (row) =>
    record({ action: 'open', id: row.id })
  )
  return (
    <NativeChatBackgroundTasksStatus
      sessionId={SOURCE}
      tasks={tasks}
      settledTasks={[]}
      supportsTaskStop
      offersStopAll={stopAll}
      stoppingTaskIds={owner.pending}
      stoppingAll={false}
      indicatorActive
      isVisible
      expanded={expanded}
      onExpandedChange={setExpanded}
      onStop={(id) => {
        if (id) {
          record({ action: 'remote-stop', id })
          setTasks((current) => current.filter((task) => task.id !== id))
        } else {
          record({ action: 'stop-all', id: '' })
        }
      }}
      workerRows={new Map(rows.map((row) => [row.id, row]))}
      workerIdentities={identities}
      onOpenWorker={owner.open}
      onWorkerAction={owner.action}
      onClearAll={owner.clearAll}
    />
  )
}

export const twentyOpen720 = defineFixture({
  width: 720,
  render: () => workerDockFixturePane(<Harness count={20} failed={3} open />)
})
export const twentyFolded720 = defineFixture({
  width: 720,
  render: () => workerDockFixturePane(<Harness count={20} failed={3} />)
})
export const twentyOpen390 = defineFixture({
  width: 390,
  render: () => workerDockFixturePane(<Harness count={20} failed={3} open />)
})
export const twentyOpen320 = defineFixture({
  width: 320,
  render: () => workerDockFixturePane(<Harness count={20} failed={3} open />)
})
export const oneFolded720 = defineFixture({
  width: 720,
  render: () => workerDockFixturePane(<Harness count={1} failed={0} />)
})
export const threeFolded720 = defineFixture({
  width: 720,
  render: () => workerDockFixturePane(<Harness count={3} failed={0} variety />)
})
export const threeOpen720 = defineFixture({
  width: 720,
  render: () => workerDockFixturePane(<Harness count={3} failed={1} variety open />)
})
export const askOpen720 = defineFixture({
  width: 720,
  render: () => workerDockFixturePane(<Harness count={6} failed={2} ask variety open />)
})
export const askFolded720 = defineFixture({
  width: 720,
  render: () => workerDockFixturePane(<Harness count={6} failed={2} ask variety />)
})
export const stopAllOpen720 = defineFixture({
  width: 720,
  render: () => workerDockFixturePane(<Harness count={5} failed={2} stopAll open />)
})
export const longFolded300 = defineFixture({
  width: 300,
  render: () => workerDockFixturePane(<Harness count={3} failed={0} long />)
})
export const longOpen300 = defineFixture({
  width: 300,
  render: () => workerDockFixturePane(<Harness count={20} failed={3} long open />)
})
// Scrolled up from the end, so Jump to latest shows and stacks above the pill.
export const jumpFolded720 = defineFixture({
  width: 720,
  render: () => workerDockFixturePane(<Harness count={3} failed={1} />),
  interact: async (frame) => {
    const transcript = frame.querySelector<HTMLElement>('[data-fixture-transcript]')
    if (transcript) {
      transcript.scrollTop = 0
      transcript.dispatchEvent(new Event('scroll'))
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
})
export const oneOpen720 = defineFixture({
  width: 720,
  render: () => workerDockFixturePane(<Harness count={1} failed={0} open />)
})
export const fourOpen720 = defineFixture({
  width: 720,
  render: () => workerDockFixturePane(<Harness count={4} failed={1} open />)
})
export const remoteOpen720 = defineFixture({
  width: 720,
  render: () => workerDockFixturePane(<Harness count={6} failed={2} remote open />)
})

export const remoteCommand720 = defineFixture({
  width: 720,
  render: () => workerDockFixturePane(<Harness count={6} failed={2} remote open command />)
})

function stack(width: number, sections: 'question' | 'queue' | 'both') {
  return defineFixture({
    width,
    render: () => workerDockFixturePane(<Harness count={9} failed={2} command />, sections)
  })
}

export const question720 = stack(720, 'question')
export const question390 = stack(390, 'question')
export const question320 = stack(320, 'question')
export const queue720 = stack(720, 'queue')
export const queue390 = stack(390, 'queue')
export const queue320 = stack(320, 'queue')
export const both720 = stack(720, 'both')
export const both390 = stack(390, 'both')
export const both320 = stack(320, 'both')
