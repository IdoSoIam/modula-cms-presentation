import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const root = process.cwd()
const input = process.argv[2]

if (!input) {
  console.error('Usage: node ./scripts/deploy-release.mjs <archive-path|version>')
  process.exit(1)
}

const archivePath = input.endsWith('.tar.gz')
  ? path.resolve(root, input)
  : path.resolve(root, '..', 'modula-cms', 'dist-releases', `modula-cms-runtime-${input}.tar.gz`)

if (!existsSync(archivePath)) {
  console.error(`Archive not found: ${archivePath}`)
  process.exit(1)
}

const version = resolveVersionFromArchive(archivePath)
const releasesDir = path.join(root, 'releases')
const releaseDir = path.join(releasesDir, version)
const currentDir = path.join(root, 'current')
const backupDir = path.join(root, 'current.previous')
const agentStateFile = path.join(root, '.modula-agent', 'state.json')
const generatedConfigPath = path.join(currentDir, 'cms.project.generated.ts')
const generatedConfigBackup = existsSync(generatedConfigPath)
  ? await readFile(generatedConfigPath, 'utf8')
  : null
const previousAgentState = await readJson(agentStateFile, {
  currentVersion: null,
  stagedVersion: null,
  rollbackVersion: null,
  lastHealthyVersion: null
})

await stopRuntime()
await rm(releaseDir, { recursive: true, force: true })
await mkdir(releaseDir, { recursive: true })
await run(`tar -xzf "${archivePath}" -C "${releaseDir}"`)

if (generatedConfigBackup) {
  await writeFile(path.join(releaseDir, 'cms.project.generated.ts'), generatedConfigBackup, 'utf8')
}

await rm(backupDir, { recursive: true, force: true })
if (existsSync(currentDir)) {
  await cp(currentDir, backupDir, { recursive: true, force: true })
}

await replaceDirectory(releaseDir, currentDir)
await writeJson(agentStateFile, {
  currentVersion: version,
  stagedVersion: version,
  rollbackVersion: previousAgentState.currentVersion || previousAgentState.rollbackVersion || null,
  lastHealthyVersion: version
})

console.log(`Release deployed to current/: ${version}`)

async function stopRuntime() {
  const stopScript = path.join(root, 'scripts', 'stop-runtime.mjs')
  await run(`${process.execPath} "${stopScript}"`, true)
}

async function replaceDirectory(sourceDir, destinationDir) {
  const previousDir = `${destinationDir}.previous-swap`
  await rm(previousDir, { recursive: true, force: true }).catch(() => {})
  if (existsSync(destinationDir)) {
    await renameWithRetry(destinationDir, previousDir)
  }
  await cp(sourceDir, destinationDir, { recursive: true, force: true })
  await rm(previousDir, { recursive: true, force: true }).catch(() => {})
}

async function renameWithRetry(from, to, attempts = 8, delayMs = 350) {
  let lastError
  for (let index = 0; index < attempts; index += 1) {
    try {
      await rename(from, to)
      return
    } catch (error) {
      lastError = error
      if (index < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
  }
  throw lastError
}

function resolveVersionFromArchive(file) {
  const match = path.basename(file).match(/^modula-cms-runtime-(.+)\.tar\.gz$/)
  if (!match) {
    throw new Error(`Unable to resolve version from archive name: ${file}`)
  }
  return match[1]
}

function run(command, allowFailure = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { cwd: root, shell: true, stdio: 'inherit', windowsHide: true })
    child.on('exit', (code) => {
      if (code === 0 || allowFailure) {
        resolve(undefined)
        return
      }
      reject(new Error(`Command failed: ${command}`))
    })
    child.on('error', (error) => allowFailure ? resolve(undefined) : reject(error))
  })
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(value, null, 2), 'utf8')
}
