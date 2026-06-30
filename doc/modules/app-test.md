# App Security Test Module

App security detection module that integrates the iJiami (爱加密) Mobile Application Security Detection Platform. Upload mobile app packages, run static security detection, track progress, inspect findings, and download reports.

## Routes

- `/apptest` — task list (auto-refreshes while tasks are uploading/running)
- `/apptest/statistics` — detection statistics dashboard
- `/apptest/new` — new detection wizard (select type → upload → configure)
- `/apptest/:taskId` — task detail (5 tabs)
- `/apptest/:taskId/report` — report management

## Backend

API prefix:

```text
/api/v1/apptest
```

Main table:

- `apptest_tasks` — local detection task records (maps to iJiami `assetsId` / `documentId`)

### Endpoints

| Method | Path | Permission | Purpose |
|--------|------|-----------|---------|
| GET | `/statistics` | apptest:read | Aggregate stats (overview, trend, risk top10, risk types) |
| GET | `/config` | apptest:read | iJiami connection config (masked) |
| POST | `/config` | apptest:manage | Update iJiami credentials |
| GET | `/strategies` | apptest:read | Detection strategy/template list |
| GET | `/assets` | apptest:read | Uploaded asset list |
| POST | `/tasks` | apptest:execute | Create detection task (async upload + start) |
| GET | `/tasks` | apptest:read | Task list (paginated) |
| GET | `/tasks/{id}` | apptest:read | Task detail record |
| DELETE | `/tasks/{id}` | apptest:manage | Delete task |
| GET | `/tasks/{id}/status` | apptest:read | Status (syncs from iJiami) |
| GET | `/tasks/{id}/detail` | apptest:read | Rich detail (base info, permissions, SDKs, behaviors) |
| GET | `/tasks/{id}/version-history` | apptest:read | Version score/risk trend |
| GET | `/tasks/{id}/vulns` | apptest:read | Vulnerability list |
| GET | `/tasks/{id}/report` | apptest:read | Download report (Word/PDF) |

## iJiami integration

Configuration (environment variables, see `.env.example`):

```text
IJIAMI_BASE_URL=https://rundet.ijiami.cn
IJIAMI_CLIENT_ID=client
IJIAMI_CLIENT_SECRET=client
IJIAMI_USERNAME=<account>
IJIAMI_PASSWORD=<password>
```

Authentication: OAuth2 password grant against `/detection/oauth/token`. The
`client_id:client_secret` pair is sent as a `Basic` header; the password is
MD5-hashed in the body. The platform-issued API client credentials differ from
the web login account — request them from iJiami.

Terminal types: `1` Android, `2` iOS, `3` 公众号, `4` 小程序, `7` SDK,
`8` IoT, `9` AAB, `10` 鸿蒙, `11` iOS SDK, `12` H5, `14` HarmonyOS.

Detection status: `1` not started, `2` running, `3` interrupted, `4` completed.

## Task lifecycle

```text
uploading → running → completed / failed
```

- `POST /tasks` persists the task as `uploading` and returns immediately; the
  upload to iJiami and detection start run in a background task, so the UI is
  never blocked by large uploads.
- The frontend polls `/tasks/{id}/status` (every 5s) which syncs progress/score
  from iJiami until the task reaches `completed`/`failed`.
- On startup, tasks stuck in `uploading` (or `running` with no `documentId`)
  for over 60 minutes are reconciled to `failed` — background workers are
  in-memory and lost on restart.

## Robustness notes

- Token refresh is guarded by an `asyncio.Lock` to avoid concurrent refresh storms.
- Uploads are capped at 500 MB (held in memory before forwarding to iJiami).
- iJiami business errors carry both `code` and `status` fields; either being
  non-success raises an error (e.g. `文件解析失败`, `该应用已上传`).
- Non-ASCII report filenames use RFC 5987 `filename*=UTF-8''` encoding.
- Version history returns empty gracefully when iJiami reports no history.

## Permissions

- `apptest:read` — view tasks, statistics, strategies, assets, reports
- `apptest:execute` — create and run detection tasks
- `apptest:manage` — update config, delete tasks
