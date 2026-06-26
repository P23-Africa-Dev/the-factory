<?php

namespace Tests;

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Routing\Middleware\ThrottleRequests;

abstract class TestCase extends BaseTestCase
{
    public function createApplication(): Application
    {
        $cacheDir = dirname(__DIR__) . '/bootstrap/cache';

        if (getenv('APP_ENV') === 'testing') {
            foreach (['config.php', 'routes-v7.php'] as $cacheFile) {
                $path = $cacheDir . '/' . $cacheFile;
                if (is_file($path)) {
                    @unlink($path);
                }
            }
        }

        return parent::createApplication();
    }

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware(ThrottleRequests::class);
    }
}
