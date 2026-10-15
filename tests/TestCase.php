<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use RuntimeException;

abstract class TestCase extends BaseTestCase
{
    /**
     * The only database identity tests are ever allowed to run against.
     * Checked from raw process env — PHPUnit's <php><env> values in
     * phpunit.xml are injected via putenv() before Laravel boots, so
     * they're already visible here, before parent::setUp() triggers
     * RefreshDatabase (Dotenv/.env.testing hasn't loaded yet at this
     * point, which is why only the non-secret identity vars are
     * mirrored into phpunit.xml and checked here).
     */
    private const ALLOWED_APP_ENV = 'testing';
    private const ALLOWED_DB_CONNECTION = 'pgsql';
    private const ALLOWED_DB_DATABASE = 'infinity_spa_test';
    private const ALLOWED_DB_HOSTS = ['127.0.0.1', 'localhost', '::1'];

    protected function setUp(): void
    {
        // Must run before parent::setUp() — that call is what triggers
        // setUpTraits()/RefreshDatabase further down the chain, so any
        // check placed after it would be too late to stop a migrate:fresh
        // against the wrong database.
        $this->guardAgainstUnsafeTestDatabase();

        parent::setUp();
    }

    private function guardAgainstUnsafeTestDatabase(): void
    {
        $appEnv = getenv('APP_ENV') ?: null;
        $connection = getenv('DB_CONNECTION') ?: null;
        $database = getenv('DB_DATABASE') ?: null;
        $host = getenv('DB_HOST') ?: null;

        $failures = [];

        if ($appEnv !== self::ALLOWED_APP_ENV) {
            $failures[] = "APP_ENV must be '".self::ALLOWED_APP_ENV."', got '{$appEnv}'";
        }

        if ($connection !== self::ALLOWED_DB_CONNECTION) {
            $failures[] = "DB_CONNECTION must be '".self::ALLOWED_DB_CONNECTION."', got '{$connection}'";
        }

        if ($database !== self::ALLOWED_DB_DATABASE) {
            $failures[] = "DB_DATABASE must be '".self::ALLOWED_DB_DATABASE."', got '{$database}'";
        }

        if ($host !== null && ! in_array($host, self::ALLOWED_DB_HOSTS, true)) {
            $failures[] = "DB_HOST '{$host}' is not an allowed local test host";
        }

        if ($failures !== []) {
            throw new RuntimeException(
                "Refusing to run tests — unsafe database configuration detected:\n- ".
                implode("\n- ", $failures).
                "\n\nThis guard exists to stop RefreshDatabase from ever running ".
                "migrate:fresh against the wrong database. Fix phpunit.xml/.env.testing, ".
                'not this check.'
            );
        }
    }
}
