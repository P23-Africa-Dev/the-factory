<?php

declare(strict_types=1);

namespace Tests\Unit\Calendar;

use App\Services\Calendar\UserTimezoneResolver;
use Tests\TestCase;

final class UserTimezoneResolverTest extends TestCase
{
    public function test_prefers_client_timezone_when_valid(): void
    {
        $resolver = new UserTimezoneResolver();

        $this->assertSame(
            'America/Chicago',
            $resolver->resolve('America/Chicago', 'NG'),
        );
    }

    public function test_falls_back_to_company_country_timezone(): void
    {
        $resolver = new UserTimezoneResolver();

        $this->assertSame(
            'Africa/Lagos',
            $resolver->resolve(null, 'NG'),
        );
    }

    public function test_rejects_invalid_client_timezone(): void
    {
        $resolver = new UserTimezoneResolver();

        $this->assertSame(
            'Europe/London',
            $resolver->resolve('Invalid/Timezone', 'GB'),
        );
    }
}
