# Operations Runbook

## Deployment

1. Prerequisites: Docker, Docker Compose, Node.js 20+
2. Configure environment:
   - `cp .env.example .env` and set `SIGNING_SECRET`
3. Load environment variables into your shell (no dotenv):
   - PowerShell: `Get-Content .env | ForEach-Object { if ($_ -match '^([^#=]+)=(.*)$') { [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process') } }`
   - Bash: `export $(grep -v '^#' .env | xargs)`
   - Run in **every terminal** before starting services.
4. Start full stack with Docker Compose:
   - `docker compose up -d`
5. Alternatively, run app services locally for development:
   - `docker compose up -d redis mongo`
   - `npm run dev:api` (terminal 1)
   - `npm run dev:worker` (terminal 2)
6. Initialize indexes:
   - `npm run db:init-indexes`
7. Verify health:
   - `curl http://localhost:3000/health`

> **Port conflicts**: If Redis (6379) or MongoDB (27017) ports are already in use, stop the local instances first or update the port mappings in `docker-compose.yml` and `.env`.

## Monitoring

- API health endpoint: `GET /health` (Redis + Mongo connectivity).
- Worker health is logged every 30 seconds.
- Key log events:
  - `Shutdown signal received`
  - `Job failed`
  - `Event moved to dead-letter`
- Logs are JSON (Pino). Use `jq` or aggregator tooling for filtering.

## DLQ Reprocessing

1. Check pending count:
   - `mongosh --eval "db.dead_letter_events.countDocuments({reviewStatus: 'pending'})"`
2. Replay pending items:
   - `npx tsx scripts/dlq/replay-dlq.ts --limit 10`
3. Observe review status transitions:
   - `pending -> replayed` (and downstream processing updates)

## Troubleshooting

- Redis unavailable:
  - API may return 503.
  - Worker cannot read/write queue.
  - Action: recover Redis, restart services.
- Mongo unavailable:
  - API/worker persistence fails.
  - Action: recover Mongo, restart services.
- Worker appears stuck:
  - Check worker logs and `WORKER_DRAIN_TIMEOUT_MS`.
  - Gracefully stop with SIGTERM and restart.
- High DLQ volume:
  - Query `dead_letter_events` grouped by `terminalReasonCode`.
  - Fix upstream issue, replay in controlled batches.

## Environment Variables Quick Reference

| Variable                      | Purpose                       | Tuning Guidance                                 |
| ----------------------------- | ----------------------------- | ----------------------------------------------- |
| `WORKER_CONCURRENCY`          | Parallel job processing       | Increase gradually with CPU and Redis headroom  |
| `WORKER_DRAIN_TIMEOUT_MS`     | Shutdown drain window         | Increase if jobs need longer completion         |
| `RETRY_MAX_ATTEMPTS`          | Retry cap                     | Keep bounded to avoid retry storms              |
| `RETRY_BACKOFF_BASE_MS`       | Initial retry delay           | Increase for unstable downstream dependencies   |
| `RETRY_BACKOFF_MULTIPLIER`    | Exponential growth            | Keep between 1.5 and 3 for controlled retries   |
| `RETRY_JITTER_PERCENT`        | Retry spread                  | Keep >0 to reduce synchronized retries          |
| `REDIS_URL`                   | Queue transport endpoint      | Use managed Redis with monitoring in production |
| `MONGO_URI` / `MONGO_DB_NAME` | Persistence endpoint/database | Ensure backups and index maintenance            |

## Load Testing

- Reference: `docs/load-test-proof.md`
- Command:
  - `npm run load-test`
