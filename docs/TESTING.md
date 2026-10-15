# Running the Test Suite

This project's automated tests run against a real, isolated **PostgreSQL**
database — not SQLite. This document explains why, and how to set it up
locally. **This setup is currently local-only; no CI automation exists yet**
(there is no `.github/` workflow in this repo as of this writing).

## Why not SQLite?

`phpunit.xml` used to default to an in-memory SQLite database. Several
migrations contain raw, Postgres-specific DDL (`ALTER TABLE ... DROP
CONSTRAINT IF EXISTS ...` / `ADD CONSTRAINT ... CHECK (...)`), which is
invalid syntax under SQLite. Running the suite against SQLite fails nearly
every test with a `SQLSTATE[HY000]: ... near "CONSTRAINT": syntax error`,
long before any application logic is actually exercised. Rewriting those
migrations to be driver-agnostic was judged more invasive than simply
testing against the database engine the application actually runs on in
every other environment.

## Why a separate database, and why a restricted role?

Laravel's `RefreshDatabase` trait (used by most of this suite) runs the
equivalent of `migrate:fresh` — it **drops and recreates every table** on
whatever connection the test run is pointed at. If that connection ever
pointed at the real development database, a single test run would destroy
real data. Two independent safeguards exist specifically to make that
impossible, not just unlikely:

1. **A dedicated database** (`infinity_spa_test`), never shared with the
   development database (`infinity_spa`).
2. **A restricted PostgreSQL role** (not `postgres`, not any superuser) that
   can only connect to `infinity_spa_test` — see "Provisioning the test
   role" below.

### PostgreSQL's `PUBLIC` CONNECT permission — a real trap

PostgreSQL privileges are strictly additive: a role gets the sum of what's
granted to it directly, to any role it's a member of, **and to `PUBLIC`**.
There is no "deny" mechanism. By default, every database grants `CONNECT`
to `PUBLIC`, meaning *any* role — including a newly created one with zero
explicit grants — can connect to *any* database on the server unless that
default is explicitly revoked. A role-scoped `REVOKE CONNECT ... FROM
<role>` does **nothing** if the role never had an explicit grant to begin
with — it's removing a grant that doesn't exist, while the broader `PUBLIC`
grant remains fully in effect.

The only way to achieve genuine isolation is `REVOKE CONNECT ON DATABASE
<dev-database> FROM PUBLIC` (and the same for any other database on the
server that must stay off-limits). The real Postgres superuser is
unaffected by this — a superuser bypasses all permission checks except the
`LOGIN` attribute itself, so this never breaks normal development access.

### Provisioning the test role

This document intentionally does **not** ship an executable SQL script —
provisioning should be done deliberately, once, by whoever sets up a given
machine, with each statement reviewed before running it. At minimum, the
role needs:

- `LOGIN`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`, with
  a securely generated password.
- `CONNECT` and `TEMP` on `infinity_spa_test` only.
- `CREATE` and `USAGE` on the `public` schema of `infinity_spa_test`.
- Ownership of `infinity_spa_test`'s existing tables and sequences (so it
  can `DROP TABLE ... CASCADE` them, which `RefreshDatabase` requires —
  Postgres requires *ownership*, not just granted privileges, to drop an
  object). Database ownership itself should **not** be transferred — only
  the schema's tables/sequences — so the role can never drop the database.
- `REVOKE CONNECT ON DATABASE <every other database on the server> FROM
  PUBLIC`, so no role — including this one — can reach them by default.

### Validating the role before running anything destructive

Before trusting any of this, verify it with real connection attempts, not
just catalog metadata (`has_database_privilege()` only predicts what
*should* happen):

```php
// Expect success:
DB::connection([... 'database' => 'infinity_spa_test', 'username' => 'your_test_role', ...])->select('SELECT 1');

// Expect a genuine connection-level failure (FATAL: permission denied for
// database ...), for every database that must stay off-limits:
DB::connection([... 'database' => 'infinity_spa', 'username' => 'your_test_role', ...])->select('SELECT 1');
```

Also confirm the role's attributes directly:

```sql
SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = 'your_test_role';
-- all three must be false
```

Do this *before* ever pointing `RefreshDatabase` at the role — if any of
these checks fail, stop and fix the role's grants before running tests.

## Setting up `.env.testing`

1. Copy `.env.testing.example` to `.env.testing` (gitignored — never commit
   it).
2. Fill in `DB_USERNAME`/`DB_PASSWORD` with your provisioned test role's
   credentials.
3. Generate a **testing-only** `APP_KEY` — do not reuse the one in `.env`:
   ```
   php artisan key:generate --show
   ```
   Paste the `base64:...` output into `.env.testing`'s `APP_KEY` line. Never
   paste it anywhere else, log it, or commit it.

Laravel loads `.env.testing` *instead of* `.env` entirely whenever
`APP_ENV=testing` — it does not merge the two. This is why
`.env.testing.example` repeats settings (mail, queue, broadcast, cache,
session) that already have safe defaults elsewhere: once `.env.testing`
exists, `.env` is not consulted at all during a test run.

## How isolation is enforced — two independent layers

1. **`phpunit.xml`** hardcodes `DB_CONNECTION=pgsql`, `DB_DATABASE=infinity_spa_test`,
   `DB_HOST`, and `DB_PORT` directly in its `<php><env>` block. These are
   injected via PHPUnit's own `putenv()` call, before `vendor/autoload.php`
   is even loaded — before Laravel boots at all.
2. **`tests/TestCase.php`** adds a guard that runs as the *first statement*
   of `setUp()`, strictly before `parent::setUp()` is called. `parent::setUp()`
   is what triggers `RefreshDatabase`, so the guard is checked before any
   destructive operation can occur. It reads the same raw environment
   variables phpunit.xml injects (`APP_ENV`, `DB_CONNECTION`, `DB_DATABASE`,
   `DB_HOST`) via `getenv()` — which is why those four values live in
   `phpunit.xml` rather than only in `.env.testing`: `.env.testing` isn't
   loaded by Laravel until *after* this guard already ran. Any value outside
   the allow-list throws immediately, refusing to run the test at all.

Both layers must agree for a test to run. This is deliberately redundant —
either one failing closed is enough to prevent a misconfigured run.

## Why Redis database 15

The GPS live-location feature (`TherapistLocationController`) writes raw,
unprefixed Redis keys (`booking:{id}:location`) directly. Local development
Redis uses the default database index (`0`). If tests used the same index,
a test run's writes could collide with — or be overwritten by — a real,
concurrent development session's GPS data, and vice versa. Redis supports
16 logical databases per server by default (confirmed via this project's
local `redis.windows.conf`); `.env.testing` pins tests to index `15`,
giving them a completely separate keyspace with zero code changes needed.
**Never point `.env.testing`'s `REDIS_DB` at `0`** — that reintroduces the
exact collision this setting exists to prevent.

## Running the suite

```
php artisan test
```

No special flags or environment overrides are needed — `phpunit.xml` and
`.env.testing` together configure everything.

**Expected baseline: 295 passing tests, 0 failing, 1,026 assertions.** If
your run differs from this, don't assume the application regressed — first
re-check that `.env.testing` is set up correctly and the test role's grants
match what's described above; most deviations trace back to environment
setup, not application code.

## How the GPS authorization tests work

`tests/Feature/GpsLocationChannelAuthorizationTest.php` needs to verify the
*real* `routes/channels.php` authorization closures — not a re-implementation
of the same rules inside the test, which would only prove the test agrees
with itself. The suite otherwise runs with `BROADCAST_CONNECTION=null`
globally (deliberately, so no test can trigger a real outbound broadcast),
and Laravel's `NullBroadcaster::auth()` is a no-op that never consults the
registered channel closures at all — so testing against the global default
would silently pass regardless of what the authorization logic does.

This test works around that *without* changing the global broadcast
setting: in its own `setUp()`, it reads the channel closures that
`routes/channels.php` already registered (via PHP reflection on Laravel's
internal `Broadcaster`/`BroadcastManager` classes — never reimplementing
the authorization rules) and copies that state onto a `RedisBroadcaster`,
whose `auth()` method genuinely evaluates them. It reuses the already-isolated
test Redis connection; its `auth()` path never calls `broadcast()`, so no
pub/sub message is ever published anywhere, even to that isolated Redis
database. The swap is scoped to this one test class and reverted in
`tearDown()`.

**Caveat for future Laravel upgrades:** this relies on `protected` property
names (`channels`, `channelOptions`, `authenticatedUserCallback`,
`bindingRegistrar`, `drivers`) inside Laravel's broadcasting internals —
not part of its public API contract. A future Laravel upgrade could rename
or restructure these without that being considered a breaking change by
Laravel's own versioning policy. If this test starts failing after a
Laravel upgrade with a `ReflectionException` (property does not exist), that
is the first place to look — it is a failure of this test's implementation,
not necessarily of the application's authorization logic. The failure mode
is loud (an explicit error), not a silent pass, which is why this approach
was judged acceptable despite the coupling to internals.

## What's not covered here

- There is no CI workflow in this repository yet — this entire setup is
  manual, local-only, and has only been verified on one developer's
  machine. Reproducing it on another machine or in CI requires repeating
  the role-provisioning and `.env.testing` setup steps above; nothing here
  automates that.
- Role/database provisioning SQL is described above but deliberately not
  shipped as a script in this document — run each statement deliberately,
  understanding what it does, rather than executing a script blindly
  against a database you haven't already confirmed is the right one.
