# Quickstart: Resilient Event Orchestration Gateway

Estimated time for a new engineer: 15-20 minutes.

## 1) Prerequisites

- Node.js 20+
- Docker
- Docker Compose

Expected output: `node -v` reports v20+, and `docker compose version` is available.

## 2) Clone and install

```bash
git clone <repository-url>
cd fincart
npm install
```

Expected output: npm install finishes without dependency resolution errors.

## 3) Configure environment

```bash
cp .env.example .env
```

Set at minimum:

```text
SIGNING_SECRET=your-secret
```

Expected output: `.env` file exists at repository root.

## 4) Load environment variables into your shell

This project does **not** use dotenv — you must load the variables into the process.

**PowerShell**:
```powershell
Get-Content .env | ForEach-Object { if ($_ -match '^([^#=]+)=(.*)$') { [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process') } }
```

**Bash / macOS / Linux**:
```bash
export $(grep -v '^#' .env | xargs)
```

> Run this in **every terminal** before starting services or running scripts.

## 5) Start infrastructure (Redis + MongoDB only)

```bash
docker compose up -d redis mongo
```

Expected output: containers for `redis` and `mongo` are running and healthy.

> **Note**: Do not run `docker compose up -d` (full stack). The Dockerfiles cannot resolve the `@fincart/shared` workspace dependency. Run gateway-api and gateway-worker locally via Node.js (steps 7–8).

> **Port conflict?** If port 6379 or 27017 is already in use, either stop the local service or skip Docker and point `REDIS_URL` / `MONGO_URI` in `.env` to your existing instances.

## 6) Initialize Mongo indexes

```bash
npm run db:init-indexes
```

Expected output: index creation logs for `processed_events`, `active_shipments`, and `dead_letter_events`.

## 7) Start API service (terminal 1)

```bash
npm run dev:api
```

Expected output: API starts on configured `API_PORT` (default 3000).

## 8) Start worker service (terminal 2)

```bash
npm run dev:worker
```

Expected output: worker connects to Redis and Mongo, begins polling `courier-events-main`.

## 8) Verify health endpoint

```bash
curl http://localhost:3000/health
```

Expected output:

```json
{
  "status": "healthy",
  "redis": "connected",
  "mongo": "connected",
  "timestamp": "..."
}
```

## 9) Submit a signed test event

Generate a signed payload:

```bash
SIGNING_SECRET=your-secret npx tsx scripts/signing/generate-signed-event.ts
```

Then submit to the API with headers/body from output. Example request shape:

```bash
curl -X POST http://localhost:3000/v1/events/courier \
  -H "content-type: application/json" \
  -H "x-signature: <hex-signature>" \
  -H "x-signature-timestamp: <unix-seconds>" \
  -H "x-signature-algorithm: hmac-sha256" \
  -H "x-request-id: req_manual_1" \
  -d '<json-body>'
```

Expected output: `202` with `acknowledged: true` and `queued: true`.

## 10) Run tests

```bash
npm test
```

Expected output: API and worker test suites pass.

## 11) Run load test

```bash
SIGNING_SECRET=your-secret npm run load-test
```

Expected output:

- stdout summary with latency and success-criteria checks
- results file under `scripts/load-test/results/`
