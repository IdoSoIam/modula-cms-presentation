import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import http from 'node:http'

const root = process.cwd()
const currentAgentEntry = path.join(root, 'current', 'scripts', 'update-agent.mjs')
const agentRuntimeDir = path.join(root, '.modula-agent', 'runtime')
const agentEntry = path.join(agentRuntimeDir, 'update-agent.mjs')
const envFile = path.join(root, '.env')
const pidFile = path.join(root, 'shared', 'run', 'agent.pid')

if (!existsSync(currentAgentEntry)) {
  console.error('Missing update script in current/scripts/update-agent.mjs')
  process.exit(1)
}

const env = {
  ...process.env,
  ...await loadEnv(envFile)
}

env.CMS_AGENT_HOST ||= '127.0.0.1'
env.CMS_AGENT_PORT ||= '4401'
const token = env.CMS_REGISTRY_API_KEY || env.CMS_INSTANCE_SLUG || 'modula-cms-local'

if (await isAgentReachable(env.CMS_AGENT_HOST, env.CMS_AGENT_PORT, token)) {
  console.log(`Update engine already reachable on http://${env.CMS_AGENT_HOST}:${env.CMS_AGENT_PORT}`)
  process.exit(0)
}

await mkdir(path.dirname(pidFile), { recursive: true })
await mkdir(agentRuntimeDir, { recursive: true })
await copyFile(currentAgentEntry, agentEntry)

const started = process.platform === 'win32'
  ? await startWindowsDetachedProcess()
  : await startDetachedNodeProcess()

await waitForAgent(env.CMS_AGENT_HOST, env.CMS_AGENT_PORT, token)
await writeFile(pidFile, String(started.pid), 'utf8')
console.log(`Update agent started with PID ${started.pid} on http://${env.CMS_AGENT_HOST}:${env.CMS_AGENT_PORT}`)

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

async function waitForAgent(host, port, token) {
  const startedAt = Date.now()
  while ((Date.now() - startedAt) < 8000) {
    if (await isAgentReachable(host, port, token)) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  await rm(pidFile, { force: true })
  console.error('Update agent failed to become reachable')
  process.exit(1)
}

async function startDetachedNodeProcess() {
  const child = spawn(process.execPath, [agentEntry], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env
  })

  const startResult = await new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    child.once('error', (error) => finish({ ok: false, error }))
    child.once('exit', (code) => finish({ ok: false, code }))
    setTimeout(() => finish({ ok: true }), 800)
  })

  if (!startResult.ok) {
    console.error('Update agent failed to start')
    if ('error' in startResult && startResult.error) {
      console.error(startResult.error)
    } else {
      console.error(`Exit code: ${startResult.code ?? 1}`)
    }
    process.exit(1)
  }

  child.unref()
  return { pid: child.pid }
}

async function startWindowsDetachedProcess() {
  const command = [
    'Start-Process',
    '-FilePath', quotePs(process.execPath),
    '-ArgumentList', `@(${quotePs(agentEntry)})`,
    '-WorkingDirectory', quotePs(root),
    '-WindowStyle', 'Hidden',
    '-PassThru',
    '|',
    'Select-Object',
    '-ExpandProperty',
    'Id'
  ].join(' ')

  const child = spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', command], {
    cwd: root,
    windowsHide: true,
    env
  })

  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (chunk) => { stdout += String(chunk) })
  child.stderr?.on('data', (chunk) => { stderr += String(chunk) })

  const code = await new Promise((resolve) => child.on('exit', resolve))
  if (code !== 0) {
    console.error('Update agent failed to start')
    if (stderr.trim()) {
      console.error(stderr.trim())
    }
    process.exit(1)
  }

  const pid = Number(stdout.trim())
  if (!Number.isFinite(pid) || pid <= 0) {
    console.error('Update agent failed to return a valid PID')
    process.exit(1)
  }

  return { pid }
}

function quotePs(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}
