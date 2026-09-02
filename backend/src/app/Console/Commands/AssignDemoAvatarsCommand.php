<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\User;
use App\Services\Avatar\AvatarStorageService;
use Database\Seeders\DemoCompanySeeder;
use Database\Seeders\LagosDemoCompanySeeder;
use Illuminate\Console\Command;

class AssignDemoAvatarsCommand extends Command
{
    protected $signature = 'avatars:assign-demo
                            {--dry-run : Report assignments without writing to the database}
                            {--force : Reassign avatars even when users already have one}';

    protected $description = 'Assign random gender-matched catalog avatars to demo company users missing an avatar';

    public function handle(AvatarStorageService $avatarStorage): int
    {
        $catalog = $avatarStorage->catalog();
        $maleCount = count($catalog['male'] ?? []);
        $femaleCount = count($catalog['female'] ?? []);

        if ($maleCount + $femaleCount === 0) {
            $this->error('Avatar catalog is empty. Ensure catalog assets exist on the avatars disk.');

            return self::FAILURE;
        }

        $this->info(sprintf(
            'Catalog loaded: %d male, %d female avatar(s).',
            $maleCount,
            $femaleCount,
        ));

        $demoPublicIds = [
            DemoCompanySeeder::COMPANY_PUBLIC_ID,
            LagosDemoCompanySeeder::COMPANY_PUBLIC_ID,
        ];

        $query = User::query()
            ->select('users.*')
            ->join('company_users', 'company_users.user_id', '=', 'users.id')
            ->join('companies', 'companies.id', '=', 'company_users.company_id')
            ->whereIn('companies.company_id', $demoPublicIds)
            ->distinct()
            ->orderBy('users.id');

        if (! $this->option('force')) {
            $query->whereNull('users.avatar');
        }

        $users = $query->get();

        if ($users->isEmpty()) {
            $this->info('No demo users matched the criteria.');

            return self::SUCCESS;
        }

        $dryRun = (bool) $this->option('dry-run');
        $rows = [];
        $assigned = 0;
        $skipped = 0;

        foreach ($users as $user) {
            $avatarKey = $avatarStorage->randomCatalogKeyForGender($user->gender);

            if ($avatarKey === null) {
                $this->warn("Skipped user {$user->id} ({$user->email}): no catalog key available.");
                $skipped++;

                continue;
            }

            $rows[] = [
                $user->id,
                $user->email,
                $user->gender ?? '(none)',
                $avatarKey,
            ];

            if (! $dryRun) {
                $user->forceFill(['avatar' => $avatarKey])->save();
            }

            $assigned++;
        }

        $this->table(['User ID', 'Email', 'Gender', 'Avatar key'], $rows);

        $verb = $dryRun ? 'Would assign' : 'Assigned';
        $this->info("{$verb} avatars for {$assigned} demo user(s).");

        if ($skipped > 0) {
            $this->warn("Skipped {$skipped} user(s).");
        }

        if ($dryRun) {
            $this->comment('Dry run only — no database changes were made.');
        }

        return self::SUCCESS;
    }
}
