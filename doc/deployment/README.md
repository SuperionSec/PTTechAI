# Deployment

PTTechAI ships Docker Compose configurations plus idempotent initialization
scripts, so a fresh environment can be brought up from zero.

## 1. Environment

Copy `.env.example` to `.env` and set at minimum:

| Variable | Notes |
|----------|-------|
| `SECRET_KEY` | **Required in production.** App refuses to start with the placeholder when `DEBUG=false`. |
| `DEBUG` | `false` in production. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | PostgreSQL container credentials. |
| `DATABASE_URL` | App DB URL (local runs). Format: `postgresql+asyncpg://user:pass@host:5432/db`. |
| `DOCKER_DATABASE_URL` | DB URL used inside the compose network (host `postgres`). |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | Seed super-admin (default `admin@bctech.ai` / `admin123`). |

## 2. Bring up the stack

From the `deploy/` directory (compose auto-discovers `docker-compose.yml`):

```bash
cd deploy
docker compose -p pttechai up -d --build
```

- PostgreSQL → `localhost:5432`
- Backend API → `localhost:8000`
- Frontend → `localhost:3000`

> Port conflicts? Use the override `docker-compose.e2e.yml` to remap to
> 5433 / 8100 / 3100:
> `docker compose -p pttechai -f docker-compose.yml -f docker-compose.e2e.yml up -d --build`

## 3. Database initialization (automatic)

On **first backend startup** (`app_lifecycle.startup_app`) the app automatically runs, idempotently:

1. `init_db()` — creates all tables from SQLAlchemy metadata (`create_all`).
2. `init_admin()` — seeds the super-admin from `ADMIN_*` env.
3. `init_permissions()` — seeds roles (`admin`, `tenant_admin`, `user`, `viewer`, `service`),
   permissions, and resource→permission mappings.
4. `init_vuln_library_categories()` — seeds the vulnerability-library taxonomy.
5. `init_menus()` — seeds the sidebar menu tree (pentest / apptest / vulnLibrary / system).

No manual step is needed for a fresh DB. To run it explicitly (e.g. against an
external DB before starting the app):

```bash
python -m backend.scripts.init_db
```

### Multi-tenant Row-Level Security (important)

`create_all` builds the schema but does **not** apply the RLS policies that
back tenant isolation. On the target database also run the Alembic migrations:

```bash
alembic upgrade head        # applies 20260701_0002 (RLS policies) etc.
```

RLS only takes effect when the application connects as a **non-superuser**
role. See [../multi-tenant.md](../multi-tenant.md) §6.2 for the
`pttech_app` role setup. The default `pttechai` superuser bypasses RLS — the
application-layer tenant filter still isolates data, but the DB-layer backstop
is inactive under a superuser connection.

## 4. Health check

```bash
curl http://localhost:8000/api/health
```

Expected:

```json
{"status": "healthy", "app": "PTTechAI...", "version": "3.0.0"}
```

## 5. First login

- Frontend: http://localhost:3000  (or :3100 with the e2e override)
- Credentials: `admin@bctech.ai` / `admin123` (change immediately in production)
- API docs: http://localhost:8000/api/docs

## 6. Logs

```bash
docker compose -p pttechai logs -f backend
```

## 7. Verification (CI)

```bash
# Backend unit/integration (needs a reachable PostgreSQL via DATABASE_URL)
SECRET_KEY=test-secret-key DATABASE_URL=postgresql+asyncpg://pttechai:pttechai@localhost:5432/pttechai \
  python -m pytest tests/ -q

# End-to-end against a running backend (skips automatically if unreachable)
PTTECH_E2E_BASE_URL=http://localhost:8000 python -m pytest tests/test_e2e_modules_detailed.py tests/test_e2e_multitenant.py -q

# Frontend build + Playwright page tests
npm --prefix frontend run build
cd frontend && PTTECH_E2E_WEB=http://localhost:3000 npx playwright test
```

## 8. Upgrading an existing deployment

```bash
git pull
cd deploy && docker compose -p pttechai up -d --build
alembic upgrade head        # apply any new migrations
```

The init scripts are idempotent, so restarts re-verify (never duplicate) seed data.
