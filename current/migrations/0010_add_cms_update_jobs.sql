CREATE TABLE IF NOT EXISTS "cms_update_jobs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "instance_slug" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "metadata_json" TEXT,
  "created_at" DATETIME NOT NULL,
  "updated_at" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "cms_update_job_logs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "deployment_id" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_cms_update_jobs_created_at" ON "cms_update_jobs"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_cms_update_jobs_status" ON "cms_update_jobs"("status");
CREATE INDEX IF NOT EXISTS "idx_cms_update_job_logs_deployment_id" ON "cms_update_job_logs"("deployment_id", "created_at" ASC);
