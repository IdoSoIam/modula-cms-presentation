import { readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const pidFile = path.join(process.cwd(), 'shared', 'run', 'runtime.pid')
const agentPidFile = path.join(process.cwd(), 'shared', 'run', 'agent.pid')
const skipAgentStop = process.env.MODULA_SKIP_AGENT_STOP === '1'
if (!existsSync(pidFile)) {
  if (!skipAgentStop && existsSync(agentPidFile)) {
    const agentPid = Number((await readFile(agentPidFile, 'utf8')).trim())
    if (Number.isFinite(agentPid) && agentPid > 0) {
      try {
        process.kill(agentPid)
      } catch {}
    }
    await rm(agentPidFile, { force: true })
  }
  console.log('Runtime not running')
  process.exit(0)
}

const pid = Number((await readFile(pidFile, 'utf8')).trim())
if (Number.isFinite(pid) && pid > 0) {
  try {
    process.kill(pid)
  } catch {}
}
await rm(pidFile, { force: true })

if (!skipAgentStop && existsSync(agentPidFile)) {
  const agentPid = Number((await readFile(agentPidFile, 'utf8')).trim())
  if (Number.isFinite(agentPid) && agentPid > 0) {
    try {
      process.kill(agentPid)
    } catch {}
  }
  await rm(agentPidFile, { force: true })
}

console.log(`Runtime stopped${pid ? ` (${pid})` : ''}`)
