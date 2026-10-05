# Local Redis/Valkey Setup for GPS v1

GPS v1 (see `GPS-ARCHITECTURE.md`) requires a running Redis/Valkey instance for ephemeral latest-location state. This project has no Docker or WSL available in its current local dev environment, so a Redis/Valkey server is **not started automatically** by `composer dev` / `npm run dev` and must be started separately.

## Current `.env` conventions (unchanged)

```
REDIS_CLIENT=predis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=null
```

Any Redis/Valkey server bound to `127.0.0.1:6379` with no password satisfies these as-is — no `.env` changes are needed to point at it.

## Starting a local server

Pick whichever is available on your machine:

- **Docker** (preferred if installed): `docker run -p 6379:6379 redis:7-alpine` (or `valkey/valkey:7-alpine`)
- **WSL**: `sudo apt install redis-server && redis-server --daemonize no`
- **Windows without Docker/WSL**: a portable, no-install Redis build for Windows is available at https://github.com/tporadowski/redis/releases (download the `.zip`, not the `.msi` — the zip needs no admin rights and installs no service). Extract it anywhere locally and run:
  ```
  redis-server.exe redis.windows.conf --port 6379 --bind 127.0.0.1
  ```
  This is what was used to verify connectivity for this step. The binary was downloaded to a session-scratch directory outside the repo and is **not** committed — each developer running GPS locally on Windows needs to fetch and run it themselves the same way, or use Docker/WSL/Memurai instead.

## Stopping it

Portable `redis-server.exe`: close the process or send it a normal interrupt. Docker: `docker stop <container>`. It only serves GPS's ephemeral keys — nothing else in the app (queue, cache, session, Postgres, Reverb's own event bus) depends on it being up, so stopping it does not affect the rest of the app.
