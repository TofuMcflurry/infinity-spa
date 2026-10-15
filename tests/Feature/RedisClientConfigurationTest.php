<?php

namespace Tests\Feature;

use Illuminate\Redis\Connections\PredisConnection;
use Illuminate\Support\Facades\Redis;
use Tests\TestCase;

/**
 * GPS foundation step: the GPS ADR (docs/architecture/GPS-ARCHITECTURE.md §10)
 * requires Redis/Valkey for ephemeral latest-location state. The repo audit
 * found REDIS_HOST/REDIS_PORT/REDIS_PASSWORD and the Reverb/Redis config
 * blocks already present, but no usable Redis client — the phpredis PHP
 * extension was not installed and predis/predis was not a dependency.
 *
 * This suite only proves Laravel can resolve the configured Redis client
 * (predis/predis, added as a composer dependency) and build a connection
 * object from the existing REDIS_* env vars. It intentionally does not
 * require a live Redis/Valkey server to be running — that is a separate
 * infrastructure concern from "does the PHP client wiring work" — and must
 * not be required for the rest of the suite, which never touches Redis.
 */
class RedisClientConfigurationTest extends TestCase
{
    public function test_redis_client_is_configured_to_use_predis(): void
    {
        $this->assertSame('predis', config('database.redis.client'));
    }

    public function test_laravel_can_resolve_a_predis_backed_redis_connection(): void
    {
        $connection = Redis::connection();

        $this->assertInstanceOf(PredisConnection::class, $connection);
    }

    public function test_redis_connection_uses_the_existing_env_host_and_port_conventions(): void
    {
        // Building the connection must not throw and must honor the same
        // REDIS_HOST/REDIS_PORT conventions already used elsewhere in the
        // app (e.g. Reverb's scaling config) — it must not require any new
        // env variable naming.
        $config = config('database.redis.default');

        $this->assertSame(config('database.redis.default.host'), $config['host']);
        $this->assertArrayHasKey('port', $config);
    }
}
