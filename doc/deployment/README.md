# Deployment

PTTechAI provides Docker Compose configurations for local and deployment-oriented runs.

## Environment

Use `.env` or `.env.example` as the configuration source.

Important variables:

- `SECRET_KEY`
- `DEBUG`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `DATABASE_URL`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

`SECRET_KEY` must be set explicitly. Do not use development defaults in production.

## Lite stack

```bash
docker compose --env-file .env -f deploy/docker-compose.lite.yml up -d --build
```

## Full stack

```bash
docker compose --env-file .env -f deploy/docker-compose.yml up -d --build
```

## Health check

```bash
curl http://localhost:8000/api/health
```

Expected:

```json
{"status":"ok"}
```

## Logs

```bash
docker compose -f deploy/docker-compose.lite.yml logs -f backend
```

## Verification

```bash
SECRET_KEY=test-secret-key-for-testing python -m pytest tests/ -q
npm --prefix frontend run build
```
