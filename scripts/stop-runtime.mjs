import { readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

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
  await waitForProcessExit(pid)
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

async function waitForProcessExit(pid) {
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0)
      await new Promise(resolve => setTimeout(resolve, 200))
      continue
    } catch {
      return
    }
  }

  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const child = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true
      })
      child.on('exit', () => resolve())
      child.on('error', () => resolve())
    })
  }
}
