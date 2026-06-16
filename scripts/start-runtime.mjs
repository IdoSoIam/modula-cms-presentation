import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import http from 'node:http'

const root = process.cwd()
const currentDir = path.join(root, 'current')
const envFile = path.join(root, '.env')
const pidFile = path.join(root, 'shared', 'run', 'runtime.pid')
const agentPidFile = path.join(root, 'shared', 'run', 'agent.pid')

if (!existsSync(path.join(currentDir, '.output', 'server', 'index.mjs'))) {
  console.error('Missing runtime build in current/.output/server/index.mjs')
  process.exit(1)
}

const env = {
  ...process.env,
  ...await loadEnv(envFile)
}

env.HOST ||= '127.0.0.1'
env.PORT ||= '3000'

await mkdir(path.dirname(pidFile), { recursive: true })

const started = process.platform === 'win32'
  ? await startWindowsDetachedProcess()
  : await startDetachedNodeProcess()

await writeFile(pidFile, String(started.pid), 'utf8')
console.log(`Runtime started with PID ${started.pid} on http://${env.HOST}:${env.PORT}`)

if (existsSync(path.join(currentDir, 'scripts', 'update-agent.mjs')) && !isProcessAlive(agentPidFile)) {
  const updateToken = env.CMS_REGISTRY_API_KEY || env.CMS_INSTANCE_SLUG || 'modula-cms-local'
  if (!(await isAgentReachable('127.0.0.1', '4401', updateToken))) {
    const agentChild = spawn(process.execPath, [path.join(root, 'scripts', 'start-agent.mjs')], {
      cwd: root,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env
    })
    agentChild.unref()
  }
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

function isProcessAlive(file) {
  if (!existsSync(file)) return false
  try {
    const pid = Number(readFileSync(file, 'utf8').trim())
    if (!Number.isFinite(pid) || pid <= 0) return false
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
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

async function startDetachedNodeProcess() {
  const child = spawn(process.execPath, [path.join(currentDir, '.output', 'server', 'index.mjs')], {
    cwd: currentDir,
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
    setTimeout(() => finish({ ok: true }), 1200)
  })

  if (!startResult.ok) {
    console.error('Runtime failed to start')
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
  const entry = path.join(currentDir, '.output', 'server', 'index.mjs')
  const command = [
    'Start-Process',
    '-FilePath', quotePs(process.execPath),
    '-ArgumentList', `@(${quotePs(entry)})`,
    '-WorkingDirectory', quotePs(currentDir),
    '-WindowStyle', 'Hidden',
    '-PassThru',
    '|',
    'Select-Object',
    '-ExpandProperty',
    'Id'
  ].join(' ')

  const child = spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', command], {
    cwd: currentDir,
    windowsHide: true,
    env
  })

  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (chunk) => { stdout += String(chunk) })
  child.stderr?.on('data', (chunk) => { stderr += String(chunk) })

  const code = await new Promise((resolve) => child.on('exit', resolve))
  if (code !== 0) {
    console.error('Runtime failed to start')
    if (stderr.trim()) {
      console.error(stderr.trim())
    }
    process.exit(1)
  }

  const pid = Number(stdout.trim())
  if (!Number.isFinite(pid) || pid <= 0) {
    console.error('Runtime failed to return a valid PID')
    process.exit(1)
  }

  return { pid }
}

function quotePs(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}
