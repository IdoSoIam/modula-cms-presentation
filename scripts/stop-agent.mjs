import { readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const pidFile = path.join(process.cwd(), 'shared', 'run', 'agent.pid')
if (!existsSync(pidFile)) {
  console.log('Update agent not running')
  process.exit(0)
}

const pid = Number((await readFile(pidFile, 'utf8')).trim())
if (Number.isFinite(pid) && pid > 0) {
  try {
    process.kill(pid)
  } catch {}
}
await rm(pidFile, { force: true })
console.log(`Update agent stopped${pid ? ` (${pid})` : ''}`)
