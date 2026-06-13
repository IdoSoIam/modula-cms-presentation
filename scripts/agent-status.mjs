import { readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import http from 'node:http'

const pidFile = path.join(process.cwd(), 'shared', 'run', 'agent.pid')
const envFile = path.join(process.cwd(), '.env')
const env = {
  ...process.env,
  ...await loadEnv(envFile)
}
const host = env.CMS_AGENT_HOST || '127.0.0.1'
const port = env.CMS_AGENT_PORT || '4401'
const token = env.CMS_REGISTRY_API_KEY || env.CMS_INSTANCE_SLUG || 'modula-cms-local'

if (await isAgentReachable(host, port, token)) {
  console.log('running:reachable')
  process.exit(0)
}

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

async function loadEnv(file) {
  const values = {}
  if (!existsSync(file)) return values
  const raw = await readFile(file, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue
    const index = line.indexOf('=')
    if (index < 0) continue
    const key = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim().replace(/^"|"$/g, '')
    values[key] = value
  }
  return values
}

function isAgentReachable(host, port, token) {
  return new Promise((resolve) => {
    const request = http.request({
      host,
      port: Number(port),
      path: '/health',
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`
      }
    }, (response) => {
      resolve(response.statusCode === 200)
      response.resume()
    })

    request.on('error', () => resolve(false))
    request.setTimeout(1000, () => {
      request.destroy()
      resolve(false)
    })
    request.end()
  })
}
