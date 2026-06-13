import { createServer } from 'node:http'
import { copyFile, cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'

const cwd = process.cwd()
const runtimeDir = path.resolve(cwd, process.env.CMS_AGENT_RUNTIME_DIR || '.')
const runtimeEnvFile = path.resolve(runtimeDir, process.env.CMS_AGENT_RUNTIME_ENV_FILE || '.env')
const env = {
  ...await loadEnv(runtimeEnvFile),
  ...process.env
}
const host = '127.0.0.1'
const port = 4401
const registryUrl = (env.CMS_REGISTRY_URL || '').replace(/\/$/, '')
const registryKey = env.CMS_REGISTRY_API_KEY || ''
const releaseChannel = env.CMS_RELEASE_CHANNEL || 'stable'
const instanceSlug = env.CMS_INSTANCE_SLUG || 'modula-instance'
const token = registryKey || instanceSlug || 'modula-cms-local'
const dataDir = path.resolve(runtimeDir, env.CMS_AGENT_DATA_DIR || '.modula-agent')
const legacyJobsFile = path.join(dataDir, 'jobs.json')
const legacyJobsDbFile = path.join(dataDir, 'jobs.sqlite')
const backupsDir = path.join(dataDir, 'backups')
const downloadsDir = path.join(dataDir, 'downloads')
const releasesDir = path.join(runtimeDir, 'releases')
const currentDir = path.join(runtimeDir, 'current')
const stateFile = path.join(dataDir, 'state.json')
const cmsDbFile = resolveCmsDatabasePath()
const healthcheckTarget = env.CMS_AGENT_HEALTHCHECK_URL?.trim()
  || `http://127.0.0.1:${env.NITRO_PORT || env.PORT || '3000'}/api/health`

await mkdir(downloadsDir, { recursive: true })
await mkdir(releasesDir, { recursive: true })
await mkdir(backupsDir, { recursive: true })

let db = openCmsDatabase()
let transientJob = null

await migrateLegacyJobs()

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

function resolveCmsDatabasePath() {
  const connectionString = env.DATABASE_URL?.startsWith('file:')
    ? env.DATABASE_URL
    : 'file:./prisma/local.db'
  const rawPath = connectionString.replace(/^file:/, '')
  const baseDir = currentDir
  return path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(baseDir, rawPath)
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

function parseJson(value, fallback) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(value, null, 2), 'utf8')
}

async function getState() {
  const state = await readJson(stateFile, {
    currentVersion: null,
    stagedVersion: null,
    rollbackVersion: null,
    lastHealthyVersion: null,
    lastDatabaseBackup: null
  })
  const latestCompletedJob = getLatestCompletedJob()

  if (state.rollbackVersion && state.rollbackVersion !== state.currentVersion) {
    return state
  }

  if (state.lastHealthyVersion && state.lastHealthyVersion !== state.currentVersion) {
    state.rollbackVersion = state.lastHealthyVersion
  } else if (latestCompletedJob?.metadata?.previousVersion && latestCompletedJob.metadata.previousVersion !== state.currentVersion) {
    state.rollbackVersion = latestCompletedJob.metadata.previousVersion
  } else if (state.rollbackVersion === state.currentVersion) {
    state.rollbackVersion = null
  }

  await writeJson(stateFile, state)
  return state
}

function openCmsDatabase() {
  const database = new DatabaseSync(cmsDbFile)
  database.exec('PRAGMA journal_mode = WAL;')
  database.exec('PRAGMA busy_timeout = 5000;')
  database.exec(`
    CREATE TABLE IF NOT EXISTS cms_update_jobs (
      id TEXT PRIMARY KEY,
      instance_slug TEXT NOT NULL,
      version TEXT NOT NULL,
      status TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cms_update_job_logs (
      id TEXT PRIMARY KEY,
      deployment_id TEXT NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cms_update_jobs_created_at ON cms_update_jobs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cms_update_jobs_status ON cms_update_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_cms_update_job_logs_deployment_id ON cms_update_job_logs(deployment_id, created_at ASC);
  `)
  return database
}

function sleepSync(ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    // busy wait for short sqlite lock retries in this sync script
  }
}

function isSqliteLocked(error) {
  const message = error instanceof Error ? error.message : String(error || '')
  return /database is locked|SQLITE_BUSY/i.test(message)
}

function withDbRetry(operation, attempts = 8, delayMs = 150) {
  let lastError = null
  for (let index = 0; index < attempts; index += 1) {
    try {
      return operation()
    } catch (error) {
      if (!isSqliteLocked(error) || index === attempts - 1) {
        throw error
      }
      lastError = error
      sleepSync(delayMs)
    }
  }
  throw lastError
}

function getDb() {
  if (!db) {
    db = openCmsDatabase()
  }
  return db
}

function closeDb() {
  if (!db) return
  db.close()
  db = null
}

async function getJobs(limit = 20, offset = 0) {
  let changed = false
  const now = Date.now()
  const database = getDb()
  const pendingJobs = withDbRetry(() => database.prepare(
    `SELECT id, instance_slug, version, status, metadata_json, created_at, updated_at
     FROM cms_update_jobs
     WHERE status IN ('pending', 'running')`
  ).all())

  for (const row of pendingJobs) {
    const job = hydrateJob(row)
    const updatedAt = job.updatedAt ? Date.parse(job.updatedAt) : Number.NaN
    if (!Number.isFinite(updatedAt)) continue
    if ((now - updatedAt) < 2 * 60 * 1000) continue
    job.status = 'failed'
    job.metadata = {
      ...(job.metadata || {}),
      currentStep: 'stale',
      progressPercent: job.metadata?.progressPercent || 0
    }
    job.logs = Array.isArray(job.logs) ? job.logs : []
    job.logs.push({
      id: `${job.id}-${job.logs.length + 1}`,
      deploymentId: job.id,
      level: 'error',
      message: 'Job marqué comme expiré après interruption du moteur local.',
      createdAt: new Date().toISOString()
    })
    job.updatedAt = new Date().toISOString()
    changed = true
  }

  if (changed) {
    withDbRetry(() => database.exec('PRAGMA optimize'))
  }

  return getJobsPage(limit, offset)
}

async function saveJobs(jobs) {
  for (const job of jobs) {
    upsertJob(job)
  }
}

function cloneJobSnapshot(job) {
  return JSON.parse(JSON.stringify(job))
}

function setTransientJob(job) {
  transientJob = cloneJobSnapshot(job)
}

function clearTransientJob(jobId = null) {
  if (!jobId || transientJob?.id === jobId) {
    transientJob = null
  }
}

async function persistJob(jobs, job) {
  job.updatedAt = new Date().toISOString()
  await saveJobs(jobs)
  await syncRegistryJob(job)
  setTransientJob(job)
}

async function logLine(jobs, job, message, level = 'info', options = {}) {
  job.logs.push({
    id: `${job.id}-${job.logs.length + 1}`,
    deploymentId: job.id,
    level,
    message,
    createdAt: new Date().toISOString()
  })
  if (options.persist === false) {
    job.updatedAt = new Date().toISOString()
    setTransientJob(job)
    return
  }
  await persistJob(jobs, job)
}

async function setJobProgress(jobs, job, currentStep, progressPercent, options = {}) {
  job.metadata = {
    ...(job.metadata || {}),
    currentStep,
    progressPercent
  }
  if (options.persist === false) {
    job.updatedAt = new Date().toISOString()
    setTransientJob(job)
    return
  }
  await persistJob(jobs, job)
}

async function fetchRegistry(pathname, options = {}) {
  const response = await fetch(`${registryUrl}${pathname}`, {
    ...options,
    headers: {
      authorization: `Bearer ${registryKey}`,
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  })
  if (!response.ok) {
    throw new Error(await response.text() || `Registry request failed: ${response.status}`)
  }
  return response
}

function getJobsPage(limit = 20, offset = 0) {
  const database = getDb()
  const rows = withDbRetry(() => database.prepare(
    `SELECT id, instance_slug, version, status, metadata_json, created_at, updated_at
     FROM cms_update_jobs
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`
  ).all(limit, offset))
  const items = rows.map(hydrateJob)
  if (transientJob && offset === 0 && !items.some(item => item.id === transientJob.id)) {
    items.unshift(cloneJobSnapshot(transientJob))
    return items.slice(0, limit)
  }
  return items
}

function getJobsTotal() {
  const row = withDbRetry(() => getDb().prepare('SELECT COUNT(*) AS total FROM cms_update_jobs').get())
  const baseTotal = Number(row?.total || 0)
  if (transientJob) {
    const existing = withDbRetry(() => getDb().prepare('SELECT 1 FROM cms_update_jobs WHERE id = ?').get(transientJob.id))
    return existing ? baseTotal : baseTotal + 1
  }
  return baseTotal
}

function getJobById(id) {
  if (transientJob?.id === id) {
    return cloneJobSnapshot(transientJob)
  }
  const row = withDbRetry(() => getDb().prepare(
    `SELECT id, instance_slug, version, status, metadata_json, created_at, updated_at
     FROM cms_update_jobs
     WHERE id = ?`
  ).get(id))
  return row ? hydrateJob(row) : null
}

function getLatestCompletedJob() {
  const row = withDbRetry(() => getDb().prepare(
    `SELECT id, instance_slug, version, status, metadata_json, created_at, updated_at
     FROM cms_update_jobs
     WHERE status = 'completed'
     ORDER BY created_at DESC
     LIMIT 1`
  ).get())
  return row ? hydrateJob(row) : null
}

function hydrateJob(row) {
  return {
    id: row.id,
    instanceSlug: row.instance_slug,
    version: row.version,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: parseJson(row.metadata_json, null),
    logs: withDbRetry(() => getDb().prepare(
      `SELECT id, deployment_id, level, message, created_at
       FROM cms_update_job_logs
       WHERE deployment_id = ?
       ORDER BY created_at ASC`
    ).all(row.id)).map(log => ({
      id: log.id,
      deploymentId: log.deployment_id,
      level: log.level,
      message: log.message,
      createdAt: log.created_at
    }))
  }
}

function upsertJob(job) {
  withDbRetry(() => getDb().prepare(
    `INSERT INTO cms_update_jobs (id, instance_slug, version, status, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       instance_slug = excluded.instance_slug,
       version = excluded.version,
       status = excluded.status,
       metadata_json = excluded.metadata_json,
       updated_at = excluded.updated_at`
  ).run(
    job.id,
    job.instanceSlug,
    job.version,
    job.status,
    JSON.stringify(job.metadata || null),
    job.createdAt,
    job.updatedAt
  ))

  for (const log of Array.isArray(job.logs) ? job.logs : []) {
    withDbRetry(() => getDb().prepare(
      `INSERT INTO cms_update_job_logs (id, deployment_id, level, message, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         level = excluded.level,
         message = excluded.message,
         created_at = excluded.created_at`
    ).run(log.id, job.id, log.level, log.message, log.createdAt))
  }
}

async function migrateLegacyJobs() {
  const total = getJobsTotal()
  if (total > 0) {
    await rm(legacyJobsFile, { force: true }).catch(() => {})
    await rm(legacyJobsDbFile, { force: true }).catch(() => {})
    return
  }

  if (existsSync(legacyJobsDbFile)) {
    try {
      const legacyDb = new DatabaseSync(legacyJobsDbFile)
      try {
        const hasJobsTable = legacyDb.prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'update_jobs'"
        ).get()
        if (hasJobsTable) {
          const rows = legacyDb.prepare(
            `SELECT id, instance_slug, version, status, metadata_json, created_at, updated_at
             FROM update_jobs
             ORDER BY created_at DESC`
          ).all()

          for (const row of rows) {
            const logs = legacyDb.prepare(
              `SELECT id, deployment_id, level, message, created_at
               FROM update_job_logs
               WHERE deployment_id = ?
               ORDER BY created_at ASC`
            ).all(row.id).map(log => ({
              id: log.id,
              deploymentId: log.deployment_id,
              level: log.level,
              message: log.message,
              createdAt: log.created_at
            }))

            upsertJob({
              id: row.id,
              instanceSlug: row.instance_slug,
              version: row.version,
              status: row.status,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
              metadata: parseJson(row.metadata_json, null),
              logs
            })
          }
        }
      } finally {
        legacyDb.close()
      }
    } catch {}
  }

  const legacyJobs = await readJson(legacyJobsFile, [])
  if (Array.isArray(legacyJobs) && legacyJobs.length) {
    for (const job of legacyJobs) {
      upsertJob(job)
    }
  }

  await rm(legacyJobsFile, { force: true }).catch(() => {})
  await rm(legacyJobsDbFile, { force: true }).catch(() => {})
}

async function syncRegistryJob(job) {
  if (!registryUrl || !registryKey) return
  try {
    const payload = {
      id: job.id,
      instanceSlug: job.instanceSlug,
      version: job.version,
      status: job.status,
      metadata: job.metadata || null,
      logs: Array.isArray(job.logs) ? job.logs : []
    }

    const createResponse = await fetchRegistry('/v1/deployments', {
      method: 'POST',
      body: JSON.stringify(payload)
    })

    if (!createResponse.ok) {
      throw new Error(`Registry deployment sync failed with ${createResponse.status}`)
    }
  } catch {
    try {
      const updateResponse = await fetchRegistry(`/v1/deployments/${encodeURIComponent(job.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          instanceSlug: job.instanceSlug,
          version: job.version,
          status: job.status,
          metadata: job.metadata || null,
          logs: Array.isArray(job.logs) ? job.logs : []
        })
      })
      if (!updateResponse.ok) {
        throw new Error(`Registry deployment update failed with ${updateResponse.status}`)
      }
    } catch {}
  }
}

async function listReleases() {
  if (!registryUrl || !registryKey) return []
  const response = await fetchRegistry('/v1/releases')
  const payload = await response.json()
  const items = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : []
  return items.filter(item => item.channel === releaseChannel)
}

function escapeSqlString(value) {
  return String(value).replace(/'/g, "''")
}

function tableExists(tableName) {
  const row = withDbRetry(() => getDb().prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName))
  return Boolean(row)
}

function columnExists(tableName, columnName) {
  if (!tableExists(tableName)) return false
  const columns = withDbRetry(() => getDb().prepare(`PRAGMA table_info("${tableName}")`).all())
  return columns.some(column => column.name === columnName)
}

function inferAlreadyApplied(file) {
  switch (file) {
    case '0001_init.sql':
      return tableExists('SiteParams')
    case '0002_drop_image_data.sql':
      return tableExists('Image') && !columnExists('Image', 'data')
    case '0003_add_cms_foundations.sql':
      return tableExists('CmsPage') && tableExists('CmsNavigationItem')
    default:
      return false
  }
}

function ensureMigrationsTable() {
  withDbRetry(() => getDb().exec(`
    CREATE TABLE IF NOT EXISTS "_local_migrations" (
      "name" TEXT NOT NULL PRIMARY KEY,
      "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `))
  reconcileMigrationAliases()
}

function reconcileMigrationAliases() {
  const pairs = [
    ['007_add_member_roles_and_event_audience_split.sql', '0007_add_member_roles_and_event_audience_split.sql'],
    ['008_add_event_recurrence_and_occurrences.sql', '0008_add_event_recurrence_and_occurrences.sql'],
    ['009_add_password_setup_tokens.sql', '0009_add_password_setup_tokens.sql'],
    ['010_add_cms_update_jobs.sql', '0010_add_cms_update_jobs.sql']
  ]

  for (const [legacyName, canonicalName] of pairs) {
    const row = withDbRetry(() => getDb().prepare('SELECT 1 FROM "_local_migrations" WHERE name = ?').get(legacyName))
    if (row) {
      withDbRetry(() => getDb().prepare('INSERT OR IGNORE INTO "_local_migrations" ("name") VALUES (?)').run(canonicalName))
      withDbRetry(() => getDb().prepare('DELETE FROM "_local_migrations" WHERE name = ?').run(legacyName))
    }
  }
}

function getAppliedMigrationNames() {
  ensureMigrationsTable()
  const rows = withDbRetry(() => getDb().prepare('SELECT name FROM "_local_migrations" ORDER BY name ASC').all())
  const names = rows.map(row => row.name)
  for (const file of ['0007_add_member_roles_and_event_audience_split.sql', '0008_add_event_recurrence_and_occurrences.sql', '0009_add_password_setup_tokens.sql', '0010_add_cms_update_jobs.sql']) {
    const aliases = getMigrationAliases(file)
    const matchedAlias = aliases.find(alias => names.includes(alias))
    if (matchedAlias && !names.includes(file)) {
      withDbRetry(() => getDb().prepare('INSERT OR IGNORE INTO "_local_migrations" ("name") VALUES (?)').run(file))
      names.push(file)
    }
  }
  return [...normalizeAppliedMigrationNames(names)].sort()
}

async function listMigrationFiles(migrationsDir) {
  if (!existsSync(migrationsDir)) return []
  return (await readdir(migrationsDir))
    .filter(file => file.endsWith('.sql'))
    .sort()
}

function normalizeManifestMigrations(manifest) {
  const items = Array.isArray(manifest?.migrations) ? manifest.migrations : []
  return items
    .map(item => typeof item === 'string' ? item : item?.name)
    .filter(Boolean)
    .sort()
}

function getMigrationAliases(file) {
  switch (file) {
    case '0007_add_member_roles_and_event_audience_split.sql':
      return ['007_add_member_roles_and_event_audience_split.sql']
    case '0008_add_event_recurrence_and_occurrences.sql':
      return ['008_add_event_recurrence_and_occurrences.sql']
    case '0009_add_password_setup_tokens.sql':
      return ['009_add_password_setup_tokens.sql']
    case '0010_add_cms_update_jobs.sql':
      return ['010_add_cms_update_jobs.sql']
    default:
      return []
  }
}

function normalizeAppliedMigrationNames(appliedNames) {
  const normalized = new Set(appliedNames)
  for (const name of appliedNames) {
    if (name === '007_add_member_roles_and_event_audience_split.sql') normalized.add('0007_add_member_roles_and_event_audience_split.sql')
    if (name === '008_add_event_recurrence_and_occurrences.sql') normalized.add('0008_add_event_recurrence_and_occurrences.sql')
    if (name === '009_add_password_setup_tokens.sql') normalized.add('0009_add_password_setup_tokens.sql')
    if (name === '010_add_cms_update_jobs.sql') normalized.add('0010_add_cms_update_jobs.sql')
  }
  return normalized
}

async function resolveReleaseManifest(targetDir, releaseRecord = null) {
  const manifestFile = path.join(targetDir, '.release-manifest.json')
  const localManifest = await readJson(manifestFile, null)
  if (localManifest) return localManifest
  return releaseRecord?.manifest || {}
}

async function resolveReleaseMigrations(targetDir, manifest = null) {
  const fromManifest = normalizeManifestMigrations(manifest)
  if (fromManifest.length) return fromManifest
  return await listMigrationFiles(path.join(targetDir, 'migrations'))
}

function areMigrationSetsEqual(left, right) {
  if (left.length !== right.length) return false
  return left.every((name, index) => name === right[index])
}

async function fetchReleaseRecord(version) {
  const response = await fetchRegistry(`/v1/releases/${encodeURIComponent(version)}`)
  return await response.json()
}

async function createDatabaseBackup(previousVersion, targetVersion) {
  if (!existsSync(cmsDbFile)) {
    return null
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(backupsDir, `${stamp}-${previousVersion || 'unknown'}-to-${targetVersion || 'unknown'}.sqlite`)
  await rm(backupPath, { force: true }).catch(() => {})
  ensureMigrationsTable()
  withDbRetry(() => getDb().exec(`VACUUM INTO '${escapeSqlString(backupPath)}'`), 20, 250)
  return {
    path: backupPath,
    createdAt: new Date().toISOString(),
    previousVersion: previousVersion || null,
    targetVersion: targetVersion || null
  }
}

async function restoreDatabaseBackup(backupPath) {
  if (!backupPath || !existsSync(backupPath)) {
    throw new Error(`Database backup not found: ${backupPath}`)
  }
  closeDb()
  await rm(cmsDbFile, { force: true }).catch(() => {})
  await copyFile(backupPath, cmsDbFile)
  db = openCmsDatabase()
}

async function applyReleaseMigrations(targetDir, targetManifest, jobs, job) {
  const migrationsDir = path.join(targetDir, 'migrations')
  const targetMigrations = await resolveReleaseMigrations(targetDir, targetManifest)
  const appliedNames = normalizeAppliedMigrationNames(getAppliedMigrationNames())
  const pending = targetMigrations.filter(name => !appliedNames.has(name))

  if (!pending.length) {
    await logLine(jobs, job, 'No database migration required')
    return targetMigrations
  }

  await logLine(jobs, job, `${pending.length} migration(s) to apply`)
  await setJobProgress(jobs, job, 'applying-migrations', 62)

  for (const file of pending) {
    const sqlFile = path.join(migrationsDir, file)
    if (!existsSync(sqlFile)) {
      throw new Error(`Missing migration file in release: ${file}`)
    }

    if (inferAlreadyApplied(file)) {
      withDbRetry(() => getDb().prepare('INSERT OR IGNORE INTO "_local_migrations" ("name") VALUES (?)').run(file))
      await logLine(jobs, job, `Migration already reflected in schema: ${file}`)
      continue
    }

    const sql = await readFile(sqlFile, 'utf8')
    if (sql.trim()) {
      withDbRetry(() => getDb().exec(sql), 20, 250)
    }
    withDbRetry(() => getDb().prepare('INSERT OR IGNORE INTO "_local_migrations" ("name") VALUES (?)').run(file))
    await logLine(jobs, job, `Migration applied: ${file}`)
  }

  return targetMigrations
}

async function buildRollbackCapabilities(state) {
  const capabilities = {
    fast: {
      available: false,
      reason: null
    },
    full: {
      available: false,
      reason: null,
      warning: null,
      backupCreatedAt: null
    }
  }

  if (!state.rollbackVersion) {
    capabilities.fast.reason = 'Aucune version de retour n’est disponible.'
    capabilities.full.reason = 'Aucune sauvegarde de base n’est disponible.'
    return capabilities
  }

  try {
    const release = await fetchReleaseRecord(state.rollbackVersion)
    const targetMigrations = await resolveReleaseMigrations(path.join(releasesDir, state.rollbackVersion), release.manifest || {})
    const appliedMigrations = getAppliedMigrationNames()
    const schemaCompatible = areMigrationSetsEqual(appliedMigrations, targetMigrations)

    capabilities.fast.available = schemaCompatible
    capabilities.fast.reason = schemaCompatible
      ? null
      : 'Le schéma actuel diffère de celui attendu par cette version. Utilisez la restauration complète.'
  } catch {
    capabilities.fast.reason = 'Impossible de vérifier la compatibilité de schéma pour cette version.'
  }

  const backup = state.lastDatabaseBackup
  if (backup?.path && existsSync(backup.path) && backup.previousVersion === state.rollbackVersion) {
    capabilities.full.available = true
    capabilities.full.backupCreatedAt = backup.createdAt || null
    capabilities.full.warning = 'La restauration complète remettra aussi la base de données dans l’état sauvegardé avant la mise à jour. Toutes les données ajoutées ensuite seront perdues.'
  } else {
    capabilities.full.reason = 'Aucune sauvegarde exploitable n’a été trouvée pour cette version de retour.'
  }

  return capabilities
}

function runCommand(command, workdir = runtimeDir, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: workdir,
      shell: true,
      stdio: 'inherit',
      windowsHide: true,
      env: {
        ...process.env,
        ...env,
        ...extraEnv
      }
    })
    child.on('exit', code => code === 0 ? resolve(undefined) : reject(new Error(`Command failed: ${command}`)))
    child.on('error', reject)
  })
}

async function healthcheck() {
  if (!healthcheckTarget) {
    return { ok: true, target: null, error: null }
  }

  const attempts = Number(env.CMS_AGENT_HEALTHCHECK_ATTEMPTS || 20)
  const delayMs = Number(env.CMS_AGENT_HEALTHCHECK_DELAY_MS || 1500)
  let lastError = null

  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(healthcheckTarget, { cache: 'no-store' })
      if (response.ok) {
        return { ok: true, target: healthcheckTarget, error: null }
      }
      lastError = `Healthcheck responded with ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown fetch error'
    }

    if (index < attempts - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  return { ok: false, target: healthcheckTarget, error: lastError }
}

async function switchCurrent(version) {
  const targetDir = path.join(releasesDir, version)
  if (!existsSync(targetDir)) {
    throw new Error(`Release directory missing: ${targetDir}`)
  }
  await replaceDirectory(targetDir, currentDir)
}

async function replaceDirectory(sourceDir, destinationDir) {
  const previousDir = `${destinationDir}.previous-swap`
  await rm(previousDir, { recursive: true, force: true }).catch(() => {})
  if (existsSync(destinationDir)) {
    await renameWithRetry(destinationDir, previousDir)
  }
  await cp(sourceDir, destinationDir, { recursive: true })
  await rm(previousDir, { recursive: true, force: true }).catch(() => {})
}

async function renameWithRetry(from, to, attempts = 8, delayMs = 350) {
  let lastError = null
  for (let index = 0; index < attempts; index += 1) {
    try {
      await rename(from, to)
      return
    } catch (error) {
      lastError = error
      if (index < attempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
  }
  throw lastError
}

async function restoreVersion(jobs, job, version, startCommand, stopCommand, options = {}) {
  const strategy = options.strategy || 'fast'
  const backup = options.backup || null
  await logLine(jobs, job, strategy === 'full'
    ? `Starting complete rollback to ${version}`
    : `Starting fast rollback to ${version}`)
  await runCommand(stopCommand, runtimeDir, { MODULA_SKIP_AGENT_STOP: '1' }).catch(() => {})
  if (strategy === 'full') {
    if (!backup?.path) {
      throw new Error('No database backup available for complete rollback')
    }
    await setJobProgress(jobs, job, 'rollback-restoring-database', 94)
    await restoreDatabaseBackup(backup.path)
    await logLine(jobs, job, `Database restored from backup ${backup.path}`)
  }
  await setJobProgress(jobs, job, `rollback:${version}`, 96)
  await switchCurrent(version)
  await runCommand(startCommand, runtimeDir)
  const rollbackHealth = await healthcheck()
  if (!rollbackHealth.ok) {
    throw new Error(`Rollback healthcheck failed on ${rollbackHealth.target}: ${rollbackHealth.error || 'unknown error'}`)
  }
}

async function startDeployment(version, mode = 'deploy', options = {}) {
  const jobs = await getJobs()
  const state = await getState()
  const rollbackStrategy = options.rollbackStrategy || 'fast'
  if (mode === 'deploy' && state.currentVersion === version) {
    throw new Error(`Release ${version} is already active on this instance`)
  }
  const previousVersion = state.currentVersion
  const rollbackVersion = mode === 'rollback' ? version : (previousVersion || state.rollbackVersion || null)
  const job = {
    id: `job_${Date.now()}`,
    instanceSlug,
    version,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    logs: [],
    metadata: {
      mode,
      rollbackStrategy,
      progressPercent: 5,
      currentStep: mode === 'rollback' ? 'rollback:prepare' : 'prepare',
      previousVersion,
      rollbackVersion
    }
  }
  jobs.unshift(job)
  await saveJobs(jobs)

  ;(async () => {
    try {
      job.status = 'running'
      await persistJob(jobs, job)
      setTransientJob(job)
      await logLine(jobs, job, mode === 'rollback'
        ? `Rolling back to release ${version} (${rollbackStrategy})`
        : `Fetching release ${version}`)
      await setJobProgress(jobs, job, 'fetching-release', 15)
      const release = await fetchReleaseRecord(version)

      await logLine(jobs, job, 'Downloading release artifact', 'info', { persist: false })
      await setJobProgress(jobs, job, 'downloading-artifact', 30, { persist: false })
      const artifact = await fetchRegistry(`/v1/releases/${encodeURIComponent(version)}/artifact`)
      const archivePath = path.join(downloadsDir, `${version}.tar.gz`)
      const archiveBytes = new Uint8Array(await artifact.arrayBuffer())
      await writeFile(archivePath, archiveBytes)

      const targetDir = path.join(releasesDir, version)
      await rm(targetDir, { recursive: true, force: true })
      await mkdir(targetDir, { recursive: true })
      await runCommand(`tar -xzf "${archivePath}" -C "${targetDir}"`, runtimeDir)
      await logLine(jobs, job, `Release extracted to ${targetDir}`, 'info', { persist: false })
      await setJobProgress(jobs, job, 'artifact-extracted', 45, { persist: false })
      const targetManifest = await resolveReleaseManifest(targetDir, release)

      const stopCommand = env.CMS_AGENT_STOP_COMMAND || 'npm run stop'
      const startCommand = env.CMS_AGENT_START_COMMAND || 'npm run start'
      let databaseBackup = state.lastDatabaseBackup || null

      if (mode === 'rollback') {
        const capabilities = await buildRollbackCapabilities(state)
        const schemaCompatibleRollback = Boolean(capabilities.fast.available)
        if (rollbackStrategy === 'fast' && !schemaCompatibleRollback) {
          throw new Error(capabilities.fast.reason || 'Schema incompatible with fast rollback')
        }
        if (rollbackStrategy === 'full') {
          if (!capabilities.full.available) {
            throw new Error(capabilities.full.reason || 'No database backup available for complete rollback')
          }
          databaseBackup = state.lastDatabaseBackup || null
        }

        job.metadata = {
          ...(job.metadata || {}),
          schemaCompatibleRollback,
          databaseBackup
        }
        await persistJob(jobs, job)

        await restoreVersion(jobs, job, version, startCommand, stopCommand, {
          strategy: rollbackStrategy,
          backup: databaseBackup
        })

        state.currentVersion = version
        state.stagedVersion = version
        state.lastHealthyVersion = version
        state.rollbackVersion = null
        await writeJson(stateFile, state)
        job.status = 'completed'
        job.metadata = {
          ...(job.metadata || {}),
          manifest: targetManifest || {},
          currentDir,
          releaseDir: targetDir,
          restoredVersion: version,
          progressPercent: 100,
          currentStep: 'rollback-complete'
        }
        clearTransientJob(job.id)
        return
      }

      await logLine(jobs, job, 'Stopping current runtime', 'info', { persist: false })
      await setJobProgress(jobs, job, 'stopping-runtime', 55, { persist: false })
      await runCommand(stopCommand, runtimeDir, { MODULA_SKIP_AGENT_STOP: '1' })
      await persistJob(jobs, job)

      await setJobProgress(jobs, job, 'creating-database-backup', 58)
      databaseBackup = await createDatabaseBackup(previousVersion, version)
      if (databaseBackup) {
        await logLine(jobs, job, `Database backup created at ${databaseBackup.path}`)
      } else {
        await logLine(jobs, job, 'No database file found to back up')
      }

      const targetMigrations = await applyReleaseMigrations(targetDir, targetManifest, jobs, job)
      await setJobProgress(jobs, job, 'switching-current', 70)
      await switchCurrent(version)
      await logLine(jobs, job, 'Current runtime switched')

      await logLine(jobs, job, 'Starting runtime')
      await setJobProgress(jobs, job, 'starting-runtime', 82)
      await runCommand(startCommand, runtimeDir)

      await setJobProgress(jobs, job, 'healthcheck', 92)
      const health = await healthcheck()
      if (!health.ok) {
        await logLine(jobs, job, `Healthcheck failed on ${health.target}: ${health.error || 'unknown error'}`, 'error')
        await logLine(jobs, job, 'Attempting rollback to previous working version', 'error')
        if (rollbackVersion) {
          const rollbackCapabilities = await buildRollbackCapabilities({
            ...state,
            rollbackVersion,
            lastDatabaseBackup: databaseBackup
          })
          const nextRollbackStrategy = rollbackCapabilities.fast.available ? 'fast' : 'full'
          await logLine(jobs, job, nextRollbackStrategy === 'full'
            ? 'Schema changed, complete rollback required'
            : 'Schema compatible, fast rollback selected')
          await restoreVersion(jobs, job, rollbackVersion, startCommand, stopCommand, {
            strategy: nextRollbackStrategy,
            backup: databaseBackup
          })
          state.currentVersion = rollbackVersion
          state.lastHealthyVersion = rollbackVersion
          state.rollbackVersion = rollbackVersion
          state.stagedVersion = rollbackVersion
          await writeJson(stateFile, state)
        }
        job.status = 'rolled_back'
        job.metadata = {
          ...(job.metadata || {}),
          rollbackStrategy: rollbackVersion ? (areMigrationSetsEqual(getAppliedMigrationNames(), await resolveReleaseMigrations(path.join(releasesDir, rollbackVersion), null)) ? 'fast' : 'full') : null,
          restoredVersion: rollbackVersion
        }
      } else {
        state.currentVersion = version
        state.stagedVersion = version
        state.lastHealthyVersion = version
        state.rollbackVersion = previousVersion || state.rollbackVersion || null
        state.lastDatabaseBackup = databaseBackup
        await writeJson(stateFile, state)
        job.status = 'completed'
      }

      job.metadata = {
        ...(job.metadata || {}),
        databaseBackup,
        manifest: targetManifest || {},
        currentDir,
        releaseDir: targetDir,
        previousVersion,
        rollbackVersion: state.rollbackVersion || rollbackVersion,
        schemaCompatibleRollback: rollbackVersion
          ? areMigrationSetsEqual(getAppliedMigrationNames(), await resolveReleaseMigrations(path.join(releasesDir, rollbackVersion), null))
          : false,
        targetMigrations,
        progressPercent: 100,
        currentStep: job.status === 'rolled_back' ? 'rollback-complete' : 'completed'
      }
    } catch (error) {
      job.status = 'failed'
      job.metadata = {
        ...(job.metadata || {}),
        progressPercent: job.metadata?.progressPercent || 0,
        currentStep: 'failed'
      }
      await logLine(jobs, job, error instanceof Error ? error.message : 'Deployment failed', 'error')
    } finally {
      await persistJob(jobs, job)
      clearTransientJob(job.id)
    }
  })().catch(() => {})

  return job
}

function sendJson(res, value, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(value))
}

createServer(async (req, res) => {
  if ((req.headers.authorization || '') !== `Bearer ${token}`) {
    return sendJson(res, { message: 'Unauthorized' }, 401)
  }

  if (req.method === 'GET' && req.url === '/health') {
    return sendJson(res, { ok: true })
  }

  if (req.method === 'GET' && req.url === '/status') {
    const state = await getState()
    const jobs = await getJobs()
    const rollbackCapabilities = await buildRollbackCapabilities(state)
    return sendJson(res, {
      currentVersion: state.currentVersion,
      rollbackVersion: state.rollbackVersion,
      releaseChannel,
      releases: await listReleases(),
      jobs,
      rollbackCapabilities,
      jobsPagination: {
        total: getJobsTotal(),
        limit: jobs.length,
        offset: 0,
        hasMore: getJobsTotal() > jobs.length
      }
    })
  }

  if (req.method === 'POST' && req.url === '/deploy') {
    const body = await readBody(req)
    if (!body?.version) return sendJson(res, { message: 'version required' }, 400)
    try {
      return sendJson(res, await startDeployment(body.version), 202)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Deployment refused'
      return sendJson(res, { message }, 409)
    }
  }

  if (req.method === 'POST' && req.url === '/rollback') {
    const state = await getState()
    if (!state.rollbackVersion) {
      return sendJson(res, { message: 'No working version available for rollback' }, 409)
    }
    const body = await readBody(req).catch(() => null)
    const rollbackStrategy = body?.mode === 'full' ? 'full' : 'fast'
    try {
      return sendJson(res, await startDeployment(state.rollbackVersion, 'rollback', { rollbackStrategy }), 202)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Rollback refused'
      return sendJson(res, { message }, 409)
    }
  }

  const jobsMatch = req.url?.match(/^\/jobs(?:\?(.+))?$/)
  if (req.method === 'GET' && jobsMatch && req.url?.startsWith('/jobs?')) {
    const url = new URL(req.url, `http://${host}:${port}`)
    const limit = Math.min(Number(url.searchParams.get('limit') || '20'), 100)
    const offset = Math.max(Number(url.searchParams.get('offset') || '0'), 0)
    const jobs = await getJobs(limit, offset)
    const total = getJobsTotal()
    return sendJson(res, {
      items: jobs,
      total,
      limit,
      offset,
      hasMore: (offset + jobs.length) < total
    })
  }

  const jobMatch = req.url?.match(/^\/jobs\/([^/?]+)$/)
  if (req.method === 'GET' && jobMatch) {
    const job = getJobById(jobMatch[1])
    return job ? sendJson(res, job) : sendJson(res, { message: 'Not found' }, 404)
  }

  return sendJson(res, { message: 'Not found' }, 404)
}).listen(port, host, () => {
  console.log(`Modula update script listening on http://${host}:${port} for runtime ${runtimeDir}`)
})

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (!chunks.length) return null
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
