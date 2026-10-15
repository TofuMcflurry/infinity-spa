# Local Redis/Valkey Setup for GPS v1

GPS v1 (see `GPS-ARCHITECTURE.md`) requires a running Redis/Valkey instance for ephemeral latest-location state.

This project still has no Docker or WSL available in its local dev environment, so a portable, no-install Windows Redis build is used locally instead — the same binary family described at https://github.com/tporadowski/redis/releases. Docker/WSL remain unnecessary for local development.

## Automatic startup (current)

`composer dev` now starts Redis automatically, alongside Laravel, Vite, and Reverb, as one more process in the existing `concurrently` group (see `composer.json`'s `dev` script). No manual Redis startup step is required for local development or demo/defense environments — running `composer dev` is sufficient.

The script runs:

```
cd storage/redis-local && redis-server.exe redis.windows.conf
```

which binds to `127.0.0.1:6379` with no password, matching the existing `.env` conventions (unchanged):

```
REDIS_CLIENT=predis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=null
```

## Where the binary lives

The portable `redis-server.exe`, `redis-cli.exe`, and `redis.windows.conf` live in `storage/redis-local/`, which is **git-ignored** (`.gitignore`: `/storage/redis-local`). The binary is never committed — it stays local to each machine, consistent with the original manual-setup approach. If this directory is missing on a fresh checkout (e.g. a new machine, or after a clean clone), fetch the portable build again using the manual steps below and place the files at `storage/redis-local/`.

## Manual setup (fallback, if `storage/redis-local/` is ever missing)

Pick whichever is available on your machine:

- **Docker** (if installed): `docker run -p 6379:6379 redis:7-alpine` (or `valkey/valkey:7-alpine`)
- **WSL** (if installed): `sudo apt install redis-server && redis-server --daemonize no`
- **Windows without Docker/WSL**: download the portable, no-install Redis build for Windows from https://github.com/tporadowski/redis/releases (the `.zip`, not the `.msi` — the zip needs no admin rights and installs no service). Extract `redis-server.exe`, `redis-cli.exe`, and `redis.windows.conf` into `storage/redis-local/` so `composer dev` picks them up automatically again.

## Stopping it

`composer dev` uses `concurrently --kill-others`, so stopping the `composer dev` process (e.g. Ctrl+C) stops Redis along with Laravel, Vite, and Reverb. It only serves GPS's ephemeral keys — nothing else in the app (queue, cache, session, Postgres, Reverb's own event bus) depends on it being up.

## Production/AWS

This setup is local-development-only. Production/AWS Redis remains a separate concern, mapped to Amazon ElastiCache/Valkey per `GPS-ARCHITECTURE.md` §14 — nothing here changes that mapping or introduces any production/AWS configuration.
