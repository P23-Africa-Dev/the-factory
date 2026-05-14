<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class MeEndpointTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_fetch_profile(): void
    {
        $user = User::factory()->create([
            'name' => 'Jane Doe',
            'email' => 'jane@example.com',
            'email_verified_at' => now(),
        ]);

        $company = Company::create([
            'company_id' => 'FAC-ME-CTX',
            'name' => 'Me Context Co',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Context payload test',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'role' => 'owner',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->withToken($user->createToken('t', ['*'])->plainTextToken)
            ->getJson('/api/v1/user/me');

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'message' => 'User profile fetched successfully.',
                'data' => [
                    'id' => $user->id,
                    'name' => 'Jane Doe',
                    'email' => 'jane@example.com',
                    'email_verified' => true,
                    'active_company' => [
                        'id' => $company->id,
                        'company_id' => 'FAC-ME-CTX',
                        'name' => 'Me Context Co',
                        'status' => 'active',
                        'role' => 'owner',
                    ],
                ],
            ]);
    }

    public function test_unauthenticated_user_cannot_access_me(): void
    {
        $response = $this->getJson('/api/v1/user/me');

        $response->assertUnauthorized()
            ->assertJson(['success' => false]);
    }
}
