import { readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const pidFile = path.join(process.cwd(), 'shared', 'run', 'runtime.pid')
if (!existsSync(pidFile)) {
  console.log('stopped')
  process.exit(0)
}

const pid = Number((await readFile(pidFile, 'utf8')).trim())
if (!Number.isFinite(pid) || pid <= 0) {
  await rm(pidFile, { force: true })
  console.log('stopped')
  process.exit(0)
}

try {
  process.kill(pid, 0)
  console.log(`running:${pid}`)
} catch {
  await rm(pidFile, { force: true })
  console.log('stopped')
}
