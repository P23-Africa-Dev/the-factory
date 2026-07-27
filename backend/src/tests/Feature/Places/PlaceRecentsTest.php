<?php

declare(strict_types=1);

namespace Tests\Feature\Places;

use App\Models\UserPlaceRecent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\ActivatesCompanySubscription;
use Tests\TestCase;

class PlaceRecentsTest extends TestCase
{
    use ActivatesCompanySubscription;
    use RefreshDatabase;

    public function test_user_can_list_store_and_cap_recents(): void
    {
        ['user' => $user, 'company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company);
        $token = $this->ownerToken($user);

        $store = $this->withToken($token)->postJson('/api/v1/places/recents', [
            'name' => 'Jara Mall',
            'address' => 'Ikeja, Lagos',
            'latitude' => 6.6012,
            'longitude' => 3.3511,
            'provider' => 'foursquare',
            'provider_place_id' => 'fsq_jara',
            'company_id' => $company->id,
        ]);

        $store->assertCreated()
            ->assertJsonPath('data.name', 'Jara Mall')
            ->assertJsonPath('data.provider', 'foursquare');

        $list = $this->withToken($token)->getJson('/api/v1/places/recents');
        $list->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Jara Mall');

        // Dedupe by provider id — should update, not duplicate.
        $this->withToken($token)->postJson('/api/v1/places/recents', [
            'name' => 'Jara Mall Updated',
            'address' => 'Ikeja',
            'latitude' => 6.6012,
            'longitude' => 3.3511,
            'provider' => 'foursquare',
            'provider_place_id' => 'fsq_jara',
        ])->assertCreated();

        $this->assertSame(1, UserPlaceRecent::query()->where('user_id', $user->id)->count());
        $this->assertSame('Jara Mall Updated', UserPlaceRecent::query()->first()->name);

        // Cap at 15.
        for ($i = 0; $i < 20; $i++) {
            $this->withToken($token)->postJson('/api/v1/places/recents', [
                'name' => "Place {$i}",
                'latitude' => 6.5 + ($i * 0.001),
                'longitude' => 3.3 + ($i * 0.001),
                'provider' => 'geoapify',
                'provider_place_id' => "geo_{$i}",
            ])->assertCreated();
        }

        $this->assertSame(15, UserPlaceRecent::query()->where('user_id', $user->id)->count());
    }

    public function test_guest_cannot_access_recents(): void
    {
        $this->getJson('/api/v1/places/recents')->assertUnauthorized();
        $this->postJson('/api/v1/places/recents', [
            'name' => 'X',
            'latitude' => 1,
            'longitude' => 1,
        ])->assertUnauthorized();
    }
}
