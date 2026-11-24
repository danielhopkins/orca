import { startDaemon } from '../src/main/daemon/server/daemon-main'
const [socketPath, tokenPath] = process.argv.slice(2)
void startDaemon({
  socketPath,
  tokenPath,
  spawnSubprocess: () => {
    throw new Error('no PTYs in the relay proof')
  }
}).then((daemon) => {
  console.log('ready')
  console.error('daemon fd limit (ulimit -n inherited from daemon): ' + require('node:child_process').execSync('ulimit -n', { shell: '/bin/sh' }).toString().trim())
  // Live data after a full GC: what a leak keeps, without uncollected garbage or V8's compiled code,
  // which grows in steps as hot functions tier up (a heap diff over 200 cycles showed only that).
  process.on('SIGUSR2', () => {
    ;(globalThis as any).gc()
    const m = process.memoryUsage()
    const code = require('node:v8')
      .getHeapSpaceStatistics()
      .filter((s: any) => /^(code|trusted)/.test(s.space_name))
      .reduce((sum: number, s: any) => sum + s.space_used_size, 0)
    console.log(`retained ${m.heapUsed + m.external - code} code ${code}`)
  })
  process.on('SIGTERM', () => void daemon.shutdown().then(() => process.exit(0)))
})
