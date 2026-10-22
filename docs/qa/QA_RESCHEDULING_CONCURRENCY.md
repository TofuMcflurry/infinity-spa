# Deferred QA: independent PostgreSQL expiry workers

Independent-worker verification of proposal-expiry row locking is deferred.
It requires a dedicated disposable database isolated from the regular PHPUnit
database (`infinity_spa_test`). That infrastructure is not part of Mission #39C.

The rejected shared-database reset harness has been removed. Do not restore
manual fixture commits, shared-database reset/cleanup hooks, or independent
workers in the regular suite. Existing rollback, retry, voucher, idempotency,
state-guard, audit-attribution, notification-failure and reschedule-replay
tests remain under normal Laravel `RefreshDatabase` behavior.

Future isolated verification must retain two real workers contending on the
same PostgreSQL proposal row and check exactly one committed expiry audit,
cancellation and customer notification. Review target/credential guards,
parallel-run isolation and interruption recovery before approving that setup.
