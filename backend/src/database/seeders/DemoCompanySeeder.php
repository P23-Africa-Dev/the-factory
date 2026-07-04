<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\AgentLocationSnapshot;
use App\Models\AiAutomationRule;
use App\Models\AiLog;
use App\Models\AppNotification;
use App\Models\AttendancePayrollSummary;
use App\Models\AttendanceRecord;
use App\Models\AttendanceSetting;
use App\Models\Company;
use App\Models\CompanyDemoRequest;
use App\Models\CompanyLocation;
use App\Models\CrmEmailActivityLog;
use App\Models\CrmEmailAttachment;
use App\Models\CrmEmailMessage;
use App\Models\CrmEmailThread;
use App\Models\InternalUserInvitation;
use App\Models\Kpi;
use App\Models\Lead;
use App\Models\LeadActivity;
use App\Models\LeadLabel;
use App\Models\LeadNote;
use App\Models\LeadPipeline;
use App\Models\Meeting;
use App\Models\MeetingAttendee;
use App\Models\MeetingReminder;
use App\Models\NotificationPreference;
use App\Models\PayrollSetting;
use App\Models\Project;
use App\Models\ProjectFile;
use App\Models\PushSubscription;
use App\Models\Task;
use App\Models\TaskAssignment;
use App\Models\TaskProof;
use App\Models\TaskReassignment;
use App\Models\TaskTrackingSession;
use App\Models\User;
use App\Services\Crm\MapSavedLeadBridgeService;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Seeds a single self-contained demo tenant (Beacon Field Solutions Ltd, London)
 * with realistic data in every tenant-scoped table, on the highest billing plan.
 *
 * Idempotent: re-running refreshes all demo data (and re-centres "live" timestamps
 * on now, so the map shows active agents again). Only rows belonging to the demo
 * company are ever touched.
 *
 * Run with: php artisan db:seed --class=DemoCompanySeeder --force
 */
class DemoCompanySeeder extends Seeder
{
    public const COMPANY_PUBLIC_ID = 'FAC-DEMOLDN1';

    public const DEMO_DOMAIN = 'thefactory23.com';

    public const DEMO_PASSWORD = 'BeaconDemo#2026';

    private const PLAN_KEY = 'up_to_100';

    private Company $company;

    private CarbonImmutable $now;

    /** @var array<string, User> keyed by email local part */
    private array $people = [];

    /** @var list<User> */
    private array $agents = [];

    /** @var list<User> */
    private array $supervisors = [];

    public function run(): void
    {
        $this->now = CarbonImmutable::now();

        $this->call(BillingPlanSeeder::class);

        // Allow explicit created_at/updated_at values so demo history looks organic.
        Model::unguard();

        DB::transaction(function (): void {
            $this->seedCompany();
            $this->seedPeople();
            $this->purgeCompanyChildren();
            $this->seedDemoRequest();
            $this->seedInvitations();
            $this->seedPayrollAndAttendanceSettings();
            $locations = $this->seedCompanyLocations();
            $projects = $this->seedProjects();
            $tasks = $this->seedTasks($projects, $locations);
            $this->seedTaskAssignmentsProofsAndTracking($tasks);
            $this->seedTaskReassignments($tasks);
            $this->seedAgentPresence();
            $pipelines = $this->seedPipelinesAndLabels();
            $leads = $this->seedLeads($pipelines, $locations);
            $this->seedLeadNotesAndActivities($leads);
            $this->seedCrmEmails($leads);
            $this->seedMeetings($projects, $leads);
            $this->seedKpis();
            $this->seedAttendanceRecords();
            $this->seedPayrollSummaries();
            $this->seedNotifications();
            $this->seedPushSubscriptions();
            $this->seedAi();
        });

        Model::reguard();

        $this->command?->info(sprintf(
            'Demo company "%s" (%s) seeded. Owner: oliver.bennett@%s / %s',
            $this->company->name,
            self::COMPANY_PUBLIC_ID,
            self::DEMO_DOMAIN,
            self::DEMO_PASSWORD,
        ));
    }

    private function seedCompany(): void
    {
        $this->company = Company::query()->updateOrCreate(
            ['company_id' => self::COMPANY_PUBLIC_ID],
            [
                'name' => 'Beacon Field Solutions Ltd',
                'country' => 'GB',
                'currency_code' => 'GBP',
                'team_size' => '11-50',
                'use_case' => 'Field workforce tracking, CRM and operations for our London service teams.',
                'status' => 'active',
                'activated_at' => $this->now->subMonths(4),
                'subscription_plan_key' => self::PLAN_KEY,
                'subscription_billing_interval' => 'annual',
                'subscription_status' => 'active',
                'subscription_current_period_start' => $this->now->subMonth(),
                'subscription_current_period_end' => $this->now->addYears(10),
                'subscription_grace_ends_at' => null,
                'assigned_plan_key' => self::PLAN_KEY,
                'assigned_billing_interval' => 'annual',
            ],
        );
    }

    private function seedPeople(): void
    {
        $password = Hash::make(self::DEMO_PASSWORD);
        $weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

        $roster = [
            // [first, last, company role, internal_role, gender, zone]
            ['Oliver', 'Bennett', 'owner', null, 'male', null],
            ['Amelia', 'Clarke', 'admin', 'admin', 'female', null],
            ['Daniel', 'Hughes', 'supervisor', 'supervisor', 'male', 'Central & East London'],
            ['Sophie', 'Turner', 'supervisor', 'supervisor', 'female', 'West & South London'],
            ['Harry', 'Walker', 'agent', 'agent', 'male', 'City of London'],
            ['Emily', 'Watson', 'agent', 'agent', 'female', 'Shoreditch'],
            ['Jack', 'Thompson', 'agent', 'agent', 'male', 'Islington'],
            ['Grace', 'Mitchell', 'agent', 'agent', 'female', 'Shoreditch'],
            ['Thomas', 'Reid', 'agent', 'agent', 'male', 'City of London'],
            ['Chloe', 'Baxter', 'agent', 'agent', 'female', 'Islington'],
            ['Ryan', 'OConnor', 'agent', 'agent', 'male', 'Camden'],
            ['Megan', 'Foster', 'agent', 'agent', 'female', 'Canary Wharf'],
            ['Lewis', 'Grant', 'agent', 'agent', 'male', 'Stratford'],
            ['Hannah', 'Pearce', 'agent', 'agent', 'female', 'Camden'],
            ['Callum', 'Doyle', 'agent', 'agent', 'male', 'Brixton'],
            ['Freya', 'Nicholls', 'agent', 'agent', 'female', 'Hammersmith'],
            ['Aaron', 'Shah', 'agent', 'agent', 'male', 'Croydon'],
            ['Priya', 'Patel', 'agent', 'agent', 'female', 'Wembley'],
        ];

        $joinBase = $this->now->subMonths(4);
        $index = 0;

        foreach ($roster as [$first, $last, $companyRole, $internalRole, $gender, $zone]) {
            $localPart = Str::lower($first.'.'.$last);
            $isInternal = $internalRole !== null;

            $user = User::query()->updateOrCreate(
                ['email' => $localPart.'@'.self::DEMO_DOMAIN],
                [
                    'name' => $first.' '.($last === 'OConnor' ? "O'Connor" : $last),
                    'password' => $password,
                    'email_verified_at' => $joinBase->addDays($index),
                    'onboarding_completed_at' => $joinBase->addDays($index),
                    'enterprise_onboarding_completed_at' => $companyRole === 'owner' ? $joinBase : null,
                    'internal_onboarding_completed_at' => $isInternal ? $joinBase->addDays($index) : null,
                    'onboarding_status' => 'active',
                    'internal_role' => $internalRole,
                    'assigned_zone' => $zone,
                    'work_days' => $isInternal ? $weekdays : null,
                    'base_salary' => match ($companyRole) {
                        'agent' => 2400 + (($index % 5) * 150),
                        'supervisor' => 3600,
                        'admin' => 3200,
                        default => null,
                    },
                    'salary_currency' => $isInternal ? 'GBP' : null,
                    'payroll_salary_type' => $isInternal ? 'monthly' : null,
                    'payroll_attendance_affects_pay' => $isInternal ? true : null,
                    'commission_enabled' => $companyRole === 'agent',
                    'phone_number' => sprintf('+44 74%02d %06d', 10 + $index, 310000 + ($index * 4211)),
                    'gender' => $gender,
                    'is_active' => true,
                ],
            );

            $this->people[$localPart] = $user;

            if ($companyRole === 'agent') {
                $this->agents[] = $user;
            } elseif ($companyRole === 'supervisor') {
                $this->supervisors[] = $user;
            }

            $index++;
        }

        // Supervisor + inviter links (agents split between the two supervisors).
        foreach ($this->agents as $i => $agent) {
            $agent->forceFill([
                'supervisor_user_id' => $this->supervisors[$i % 2]->id,
                'invited_by_user_id' => $this->owner()->id,
            ])->save();
        }
        $this->people['amelia.clarke']->forceFill(['invited_by_user_id' => $this->owner()->id])->save();
        foreach ($this->supervisors as $supervisor) {
            $supervisor->forceFill(['invited_by_user_id' => $this->owner()->id])->save();
        }

        // Company membership pivot.
        DB::table('company_users')->where('company_id', $this->company->id)->delete();
        $joinedAt = $this->now->subMonths(4);
        $rows = [];
        foreach ($roster as $i => [$first, $last, $companyRole]) {
            $rows[] = [
                'company_id' => $this->company->id,
                'user_id' => $this->people[Str::lower($first.'.'.$last)]->id,
                'role' => $companyRole,
                'joined_at' => $joinedAt->addDays($i),
                'created_at' => $joinedAt->addDays($i),
                'updated_at' => $joinedAt->addDays($i),
            ];
        }
        DB::table('company_users')->insert($rows);
    }

    /**
     * Remove previously seeded demo children so a re-run rebuilds them freshly.
     * Every delete is scoped to the demo company (or its users).
     */
    private function purgeCompanyChildren(): void
    {
        $companyId = $this->company->id;
        $userIds = collect($this->people)->pluck('id')->all();

        Meeting::withTrashed()->where('company_id', $companyId)->forceDelete();
        Kpi::withTrashed()->where('company_id', $companyId)->forceDelete();
        Task::query()->where('company_id', $companyId)->delete();
        Project::query()->where('company_id', $companyId)->delete();
        CrmEmailThread::query()->where('company_id', $companyId)->delete();
        CrmEmailActivityLog::query()->where('company_id', $companyId)->delete();
        Lead::withTrashed()->where('company_id', $companyId)->forceDelete();
        LeadLabel::query()->where('company_id', $companyId)->delete();
        LeadPipeline::query()->where('company_id', $companyId)->delete();
        CompanyLocation::query()->where('company_id', $companyId)->delete();
        AgentLocationSnapshot::query()->where('company_id', $companyId)->delete();
        AttendanceRecord::query()->where('company_id', $companyId)->delete();
        AttendancePayrollSummary::query()->where('company_id', $companyId)->delete();
        AppNotification::query()->where('company_id', $companyId)->delete();
        NotificationPreference::query()->where('company_id', $companyId)->delete();
        PushSubscription::query()->where('company_id', $companyId)->delete();
        AiAutomationRule::query()->where('company_id', $companyId)->delete();
        AiLog::query()->where('company_id', $companyId)->delete();
        InternalUserInvitation::query()->where('company_id', $companyId)->delete();
        CompanyDemoRequest::query()->where('company_id', $companyId)->delete();
        TaskReassignment::query()->where('company_id', $companyId)->delete();

        DB::table('personal_access_tokens')
            ->where('tokenable_type', User::class)
            ->whereIn('tokenable_id', $userIds)
            ->where('name', 'demo-seed-device')
            ->delete();
    }

    private function seedDemoRequest(): void
    {
        CompanyDemoRequest::query()->create([
            'full_name' => 'Oliver Bennett',
            'email' => $this->owner()->email,
            'phone' => $this->owner()->phone_number,
            'company_name' => $this->company->name,
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'Field workforce tracking, CRM and operations for our London service teams.',
            'registration_purpose' => 'enterprise',
            'registration_user_type' => 'operations',
            'status' => 'activated',
            'company_id' => $this->company->id,
            'user_id' => $this->owner()->id,
            'requested_at' => $this->now->subMonths(4)->subDays(6),
            'reviewed_at' => $this->now->subMonths(4)->subDays(5),
            'approved_at' => $this->now->subMonths(4)->subDays(5),
            'activated_at' => $this->now->subMonths(4),
            'admin_notes' => 'Demo tenant used for live client demonstrations.',
            'assigned_plan_key' => self::PLAN_KEY,
            'assigned_billing_interval' => 'annual',
        ]);
    }

    private function seedInvitations(): void
    {
        $joinBase = $this->now->subMonths(4);
        $i = 0;

        foreach ($this->people as $user) {
            if ($user->is($this->owner())) {
                continue;
            }

            InternalUserInvitation::query()->create([
                'company_id' => $this->company->id,
                'user_id' => $user->id,
                'invited_by_user_id' => $this->owner()->id,
                'role' => $user->internal_role ?? 'member',
                'supervisor_user_id' => $user->supervisor_user_id,
                'token_hash' => hash('sha256', Str::random(48)),
                'expires_at' => $joinBase->addDays($i)->addDays(7),
                'sent_at' => $joinBase->addDays($i),
                'accepted_at' => $joinBase->addDays($i)->addHours(6),
            ]);

            $i++;
        }
    }

    private function seedPayrollAndAttendanceSettings(): void
    {
        PayrollSetting::query()->updateOrCreate(
            ['company_id' => $this->company->id],
            [
                'salary_type' => 'monthly',
                'base_salary' => 2400,
                'currency' => 'GBP',
                'work_days' => 22,
                'work_hours' => 8,
                'daily_pay' => 109.09,
                'attendance_affects_pay' => true,
                'commission_enabled' => true,
            ],
        );

        AttendanceSetting::query()->updateOrCreate(
            ['company_id' => $this->company->id],
            [
                'opening_time' => '08:30:00',
                'closing_time' => '17:30:00',
                'working_days' => ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
                'clockin_window_minutes' => 30,
                'auto_clockout_enabled' => true,
            ],
        );
    }

    /**
     * @return array<string, CompanyLocation>
     */
    private function seedCompanyLocations(): array
    {
        $definitions = [
            ['Beacon HQ — Shoreditch', 'office', '48 Rivington Street, Shoreditch, London EC2A 3QP', 51.52640, -0.08110],
            ['Park Royal Warehouse', 'warehouse', 'Unit 9, Premier Park Road, Park Royal, London NW10 7NZ', 51.53080, -0.27960],
            ['Canary Wharf Client Tower', 'client_site', '25 Canada Square, Canary Wharf, London E14 5LQ', 51.50540, -0.02350],
            ['Westfield Stratford Retail Unit', 'retail_store', 'Montfichet Road, Stratford, London E20 1EJ', 51.54340, -0.00980],
            ['Croydon Service Centre', 'service_center', '124 George Street, Croydon CR0 1PJ', 51.37440, -0.09760],
            ['Dagenham Distribution Centre', 'distribution_center', 'Chequers Lane, Dagenham RM9 6PR', 51.53020, 0.14570],
            ['St Thomas\' Hospital Site', 'hospital', 'Westminster Bridge Road, Lambeth, London SE1 7EH', 51.49880, -0.11760],
            ['Mayfair Hotel Client', 'hotel', 'Stratton Street, Mayfair, London W1J 8LT', 51.50750, -0.14290],
            ['Hackney Academy School', 'school', '1 Downs Park Road, Hackney, London E8 2LZ', 51.55210, -0.06630],
            ['Oxford Street Flagship Store', 'retail_store', '318 Oxford Street, London W1C 1HF', 51.51520, -0.14450],
            ['Westminster Council Office', 'government_office', '64 Victoria Street, Westminster, London SW1E 6QP', 51.49670, -0.13600],
            ['Soho Restaurant Group', 'restaurant', '26 Dean Street, Soho, London W1D 3LL', 51.51360, -0.13210],
        ];

        $locations = [];
        foreach ($definitions as $i => [$name, $type, $address, $lat, $lng]) {
            $locations[$name] = CompanyLocation::query()->create([
                'company_id' => $this->company->id,
                'created_by_user_id' => $this->owner()->id,
                'name' => $name,
                'type' => $type,
                'description' => 'Key operational site for Beacon field teams.',
                'address' => $address,
                'latitude' => $lat,
                'longitude' => $lng,
                'contact_number' => sprintf('+44 20 7%03d %04d', 100 + $i * 7, 2200 + $i * 31),
                'email' => 'sites+'.Str::slug($name).'@'.self::DEMO_DOMAIN,
                'is_active' => true,
            ]);
        }

        return $locations;
    }

    /**
     * @return list<Project>
     */
    private function seedProjects(): array
    {
        $definitions = [
            // [name, type, status, priority, manager index (supervisors), start offset days, duration]
            ['Q3 Retail Merchandising Audit', 'inspection', 'active', 'high', 0, -21, 60],
            ['Canary Wharf Fit-Out Inspections', 'inspection', 'active', 'high', 0, -35, 45],
            ['West London Smart Meter Rollout', 'deployment', 'active', 'medium', 1, -50, 90],
            ['Hyde Property Group Onboarding', 'sales', 'active', 'high', 1, -14, 30],
            ['Westfield Summer Brand Activation', 'sales', 'planning', 'medium', 0, 7, 21],
            ['NHS Site Compliance Surveys', 'inspection', 'active', 'high', 1, -28, 75],
            ['Islington Fibre Door-to-Door', 'sales', 'active', 'medium', 0, -42, 60],
            ['Hotel Minibar Restock Programme', 'deployment', 'completed', 'low', 1, -90, 30],
            ['EV Charger Site Surveys', 'inspection', 'planning', 'medium', 0, 14, 40],
            ['Soho Restaurant POS Upgrades', 'deployment', 'completed', 'medium', 1, -75, 25],
        ];

        $projects = [];
        foreach ($definitions as $i => [$name, $type, $status, $priority, $managerIdx, $startOffset, $duration]) {
            $start = $this->now->addDays($startOffset);
            $project = Project::query()->create([
                'company_id' => $this->company->id,
                'created_by_user_id' => $this->owner()->id,
                'project_manager_user_id' => $this->supervisors[$managerIdx]->id,
                'name' => $name,
                'description' => 'London field operations project covering site visits, verification and client reporting.',
                'type' => $type,
                'status' => $status,
                'priority' => $priority,
                'start_date' => $start->toDateString(),
                'end_date' => $start->addDays($duration)->toDateString(),
                'duration_days' => $duration,
                'territory_zone' => $i % 2 === 0 ? 'Central & East London' : 'West & South London',
                'notes' => 'Weekly progress review with the client every Friday.',
            ]);
            $projects[] = $project;

            // Project team: manager + 3 rotating agents.
            $team = [
                ['user_id' => $this->supervisors[$managerIdx]->id, 'role' => 'manager'],
            ];
            for ($a = 0; $a < 3; $a++) {
                $team[] = ['user_id' => $this->agents[($i + $a * 3) % count($this->agents)]->id, 'role' => 'team_member'];
            }
            foreach ($team as $member) {
                DB::table('project_users')->insert([
                    'project_id' => $project->id,
                    'user_id' => $member['user_id'],
                    'assigned_by_user_id' => $this->owner()->id,
                    'role' => $member['role'],
                    'created_at' => $this->now,
                    'updated_at' => $this->now,
                ]);
            }

            ProjectFile::query()->create([
                'project_id' => $project->id,
                'uploaded_by_user_id' => $this->supervisors[$managerIdx]->id,
                'disk' => 'public',
                'file_path' => 'project-files/demo/'.Str::slug($name).'-brief.pdf',
                'original_name' => $name.' — Brief.pdf',
                'mime_type' => 'application/pdf',
                'size_bytes' => 240000 + $i * 13500,
                'metadata' => ['pages' => 6 + $i, 'source' => 'demo-seed'],
            ]);
        }

        return $projects;
    }

    /**
     * @param  list<Project>  $projects
     * @param  array<string, CompanyLocation>  $locations
     * @return list<Task>
     */
    private function seedTasks(array $projects, array $locations): array
    {
        $locationList = array_values($locations);

        $definitions = [
            // [title, type, status, priority, due offset hours, photos, verify]
            ['Merchandising audit — Oxford Street flagship', 'inspection', 'completed', 'high', -70, 3, true],
            ['POS installation check — Soho Dean Street', 'inspection', 'completed', 'medium', -52, 2, true],
            ['Smart meter install — Ealing Broadway cluster', 'delivery', 'completed', 'medium', -30, 2, true],
            ['Compliance survey — St Thomas\' Hospital wing B', 'inspection', 'completed', 'high', -26, 3, true],
            ['Client walkthrough — Canary Wharf floor 22', 'sales_visit', 'in_progress', 'high', 4, 2, true],
            ['Fibre sign-ups — Upper Street Islington', 'sales_visit', 'in_progress', 'medium', 6, 0, false],
            ['Stock count — Park Royal warehouse bay 4', 'inspection', 'in_progress', 'medium', 8, 1, true],
            ['Brand activation setup — Westfield Stratford', 'awareness', 'in_progress', 'high', 10, 2, true],
            ['Minibar restock — Mayfair hotel floors 3-5', 'delivery', 'paused', 'low', 20, 1, false],
            ['EV charger survey — Croydon George Street', 'inspection', 'paused', 'medium', 30, 2, true],
            ['Site induction — Hackney Academy', 'awareness', 'pending', 'medium', 28, 0, false],
            ['Meter fault revisit — Wembley Park', 'inspection', 'pending', 'high', 32, 2, true],
            ['Council permit collection — Westminster', 'collection', 'pending', 'medium', 45, 0, false],
            ['New lead visit — Shoreditch tech campus', 'sales_visit', 'pending', 'high', 50, 0, false],
            ['Distribution check — Dagenham chequers lane', 'inspection', 'pending', 'medium', 55, 1, true],
            ['Payment collection — Soho restaurant group', 'collection', 'pending', 'high', 60, 0, true],
            ['Door-to-door — Highbury Fields round', 'sales_visit', 'pending', 'medium', 75, 0, false],
            ['Quarterly audit — Croydon service centre', 'inspection', 'pending', 'low', 90, 2, false],
            ['Signage removal — old Brixton site', 'delivery', 'cancelled', 'low', -10, 0, false],
            ['Leaflet drop — Camden Market', 'awareness', 'cancelled', 'low', -5, 0, false],
        ];

        $tasks = [];
        foreach ($definitions as $i => [$title, $type, $status, $priority, $dueOffset, $photos, $verify]) {
            $agent = $this->agents[$i % count($this->agents)];
            $location = $locationList[$i % count($locationList)];
            $creator = $i % 3 === 0 ? $this->owner() : $this->supervisors[$i % 2];
            $due = $this->now->addHours($dueOffset);

            $startedAt = in_array($status, ['in_progress', 'paused', 'completed'], true)
                ? $due->subHours(3)
                : null;

            $tasks[] = Task::query()->create([
                'company_id' => $this->company->id,
                'project_id' => $projects[$i % count($projects)]->id,
                'created_by_user_id' => $creator->id,
                'assigned_agent_id' => $status === 'cancelled' ? null : $agent->id,
                'last_status_updated_by_user_id' => $status === 'pending' ? $creator->id : $agent->id,
                'title' => $title,
                'type' => $type,
                'description' => 'Complete the visit, capture required evidence and update the outcome before leaving site.',
                'location_text' => $location->name,
                'address_full' => $location->address,
                'latitude' => $location->latitude,
                'longitude' => $location->longitude,
                'due_at' => $due,
                'required_actions' => ['Check in on arrival', 'Photograph evidence', 'Collect client signature'],
                'priority' => $priority,
                'minimum_photos_required' => $photos,
                'visit_verification_required' => $verify,
                'status' => $status,
                'started_at' => $startedAt,
                'paused_at' => $status === 'paused' ? $due->subHours(1) : null,
                'resumed_at' => null,
                'completed_at' => $status === 'completed' ? $due->subMinutes(40) : null,
                'created_at' => $due->subDays(3),
                'updated_at' => $this->now,
            ]);
        }

        return $tasks;
    }

    /**
     * @param  list<Task>  $tasks
     */
    private function seedTaskAssignmentsProofsAndTracking(array $tasks): void
    {
        foreach ($tasks as $i => $task) {
            if ($task->assigned_agent_id === null) {
                continue;
            }

            $assignedAt = CarbonImmutable::parse($task->created_at);

            // A few tasks carry a historical (reassigned-away) record for realism.
            if ($i % 6 === 0) {
                $previousAgent = $this->agents[($i + 5) % count($this->agents)];
                if ($previousAgent->id !== $task->assigned_agent_id) {
                    TaskAssignment::query()->create([
                        'task_id' => $task->id,
                        'assigned_by_user_id' => $task->created_by_user_id,
                        'assigned_agent_id' => $previousAgent->id,
                        'assigned_at' => $assignedAt,
                        'unassigned_at' => $assignedAt->addHours(5),
                        'is_current' => false,
                    ]);
                    $assignedAt = $assignedAt->addHours(5);
                }
            }

            TaskAssignment::query()->create([
                'task_id' => $task->id,
                'assigned_by_user_id' => $task->created_by_user_id,
                'assigned_agent_id' => $task->assigned_agent_id,
                'assigned_at' => $assignedAt,
                'is_current' => true,
            ]);

            $status = $task->status->value;

            if (in_array($status, ['in_progress', 'paused', 'completed'], true)) {
                $this->seedTrackingForTask($task);
            }

            if (in_array($status, ['completed', 'in_progress'], true) && $task->minimum_photos_required > 0) {
                for ($p = 0; $p < max(2, $task->minimum_photos_required); $p++) {
                    TaskProof::query()->create([
                        'task_id' => $task->id,
                        'uploaded_by_user_id' => $task->assigned_agent_id,
                        'disk' => 'public',
                        'file_path' => sprintf('task-proofs/demo/task-%d-photo-%d.jpg', $task->id, $p + 1),
                        'mime_type' => 'image/jpeg',
                        'size_bytes' => 1800000 + $p * 240000,
                        'latitude' => (float) $task->latitude + 0.0002 * $p,
                        'longitude' => (float) $task->longitude - 0.0001 * $p,
                        'captured_at' => CarbonImmutable::parse($task->started_at ?? $this->now)->addMinutes(30 + $p * 12),
                        'notes' => $p === 0 ? 'Site entrance on arrival.' : 'Evidence of completed work.',
                        'metadata' => ['device' => 'Pixel 8', 'source' => 'demo-seed'],
                    ]);
                }
            }
        }
    }

    private function seedTrackingForTask(Task $task): void
    {
        $agentId = $task->assigned_agent_id;
        $startedAt = CarbonImmutable::parse($task->started_at ?? $this->now->subHours(2));
        $isFinished = $task->status->value === 'completed';

        // Start ~2km away from the destination and walk in.
        $destLat = (float) $task->latitude;
        $destLng = (float) $task->longitude;
        $startLat = $destLat + 0.0160;
        $startLng = $destLng - 0.0210;

        $session = TaskTrackingSession::query()->create([
            'task_id' => $task->id,
            'company_id' => $this->company->id,
            'started_by_user_id' => $agentId,
            'completed_by_user_id' => $isFinished ? $agentId : null,
            'start_latitude' => $startLat,
            'start_longitude' => $startLng,
            'start_accuracy_meters' => 12,
            'start_recorded_at' => $startedAt,
            'destination_latitude' => $destLat,
            'destination_longitude' => $destLng,
            'destination_radius_meters' => 75,
            'near_detected_at' => $startedAt->addMinutes(38),
            'near_latitude' => $destLat + 0.0009,
            'near_longitude' => $destLng - 0.0011,
            'arrival_detected_at' => $startedAt->addMinutes(42),
            'arrival_latitude' => $destLat + 0.0002,
            'arrival_longitude' => $destLng - 0.0002,
            'last_latitude' => $isFinished ? $destLat : $destLat + 0.0003,
            'last_longitude' => $isFinished ? $destLng : $destLng + 0.0002,
            'last_accuracy_meters' => 9,
            'last_recorded_at' => $isFinished ? $startedAt->addMinutes(140) : $this->now,
            'end_latitude' => $isFinished ? $destLat : null,
            'end_longitude' => $isFinished ? $destLng : null,
            'end_accuracy_meters' => $isFinished ? 8 : null,
            'end_recorded_at' => $isFinished ? $startedAt->addMinutes(140) : null,
        ]);

        $points = [];
        $steps = 14;
        for ($s = 0; $s <= $steps; $s++) {
            $progress = $s / $steps;
            $jitter = (($s % 3) - 1) * 0.0004;
            $points[] = [
                'tracking_session_id' => $session->id,
                'task_id' => $task->id,
                'company_id' => $this->company->id,
                'user_id' => $agentId,
                'latitude' => $startLat + ($destLat - $startLat) * $progress + $jitter,
                'longitude' => $startLng + ($destLng - $startLng) * $progress + $jitter,
                'accuracy_meters' => 8 + ($s % 4) * 3,
                'speed_mps' => $s === $steps ? 0 : 1.2 + ($s % 3) * 0.4,
                'heading_degrees' => 40 + $s * 3,
                'event_type' => match (true) {
                    $s === 0 => 'start',
                    $s === $steps => $isFinished ? 'end' : 'movement',
                    default => 'movement',
                },
                'is_checkpoint' => $s % 5 === 0,
                'recorded_at' => $startedAt->addMinutes($s * 3),
                'created_at' => $this->now,
                'updated_at' => $this->now,
            ];
        }
        DB::table('task_location_points')->insert($points);
    }

    /**
     * @param  list<Task>  $tasks
     */
    private function seedTaskReassignments(array $tasks): void
    {
        $statuses = ['accepted', 'accepted', 'accepted', 'accepted', 'rejected', 'rejected', 'pending', 'pending', 'cancelled', 'accepted'];

        foreach ($statuses as $i => $status) {
            $task = $tasks[$i % count($tasks)];
            $from = $this->agents[$i % count($this->agents)];
            $to = $this->agents[($i + 4) % count($this->agents)];
            $requestedAt = $this->now->subDays(9 - ($i % 9))->addHours($i);

            TaskReassignment::query()->create([
                'task_id' => $task->id,
                'company_id' => $this->company->id,
                'requested_by_user_id' => $this->supervisors[$i % 2]->id,
                'from_user_id' => $from->id,
                'to_user_id' => $to->id,
                'status' => $status,
                'reason' => 'Coverage rebalancing across the London zones for the day.',
                'response_note' => $status === 'rejected' ? 'Already committed to another visit in this window.' : null,
                'responded_by_user_id' => in_array($status, ['accepted', 'rejected'], true) ? $to->id : null,
                'requested_at' => $requestedAt,
                'responded_at' => in_array($status, ['accepted', 'rejected'], true) ? $requestedAt->addMinutes(25) : null,
                'accepted_at' => $status === 'accepted' ? $requestedAt->addMinutes(25) : null,
                'rejected_at' => $status === 'rejected' ? $requestedAt->addMinutes(25) : null,
                'cancelled_at' => $status === 'cancelled' ? $requestedAt->addHours(2) : null,
                'tracking_transferred_at' => $status === 'accepted' ? $requestedAt->addMinutes(26) : null,
                'action_token' => Str::random(40),
                'expires_at' => $requestedAt->addHours(24),
            ]);
        }
    }

    /**
     * One live map snapshot per agent, concentrated around Central/East London,
     * plus a fresh API session so presence shows online.
     */
    private function seedAgentPresence(): void
    {
        // Dense cluster: City / Shoreditch / Islington. Remainder spread across Greater London.
        $spots = [
            [51.5265, -0.0782], [51.5230, -0.0810], [51.5288, -0.0871], [51.5199, -0.0921],
            [51.5155, -0.0922], [51.5178, -0.0801], [51.5362, -0.1033], [51.5330, -0.0970],
            [51.5390, -0.1426], [51.5054, -0.0235], [51.5434, -0.0098], [51.4613, -0.1156],
            [51.4927, -0.2240], [51.3744, -0.0976],
        ];

        $activeTasks = Task::query()
            ->where('company_id', $this->company->id)
            ->whereIn('status', ['in_progress', 'paused'])
            ->get()
            ->keyBy('assigned_agent_id');

        foreach ($this->agents as $i => $agent) {
            [$lat, $lng] = $spots[$i % count($spots)];
            $task = $activeTasks->get($agent->id);
            // Most agents pinged within the last few minutes; a couple are stale.
            $lastSeen = $i < 11 ? $this->now->subSeconds(20 + $i * 15) : $this->now->subHours(3 + $i);

            AgentLocationSnapshot::query()->create([
                'company_id' => $this->company->id,
                'user_id' => $agent->id,
                'task_id' => $task?->id,
                'latitude' => $lat,
                'longitude' => $lng,
                'accuracy_meters' => 10 + $i,
                'speed_mps' => $task ? 1.4 : 0,
                'heading_degrees' => ($i * 37) % 360,
                'event_type' => $task ? 'movement' : 'idle',
                'task_status' => $task?->status->value,
                'arrived' => $task !== null && $i % 3 === 0,
                'recorded_at' => $lastSeen,
                'last_seen_at' => $lastSeen,
            ]);

            DB::table('personal_access_tokens')->insert([
                'tokenable_type' => User::class,
                'tokenable_id' => $agent->id,
                'name' => 'demo-seed-device',
                'token' => hash('sha256', Str::random(64)),
                'abilities' => '["*"]',
                'last_used_at' => $lastSeen,
                'created_at' => $this->now->subDays(10),
                'updated_at' => $lastSeen,
            ]);
        }
    }

    /**
     * @return array{sales: LeadPipeline, enterprise: LeadPipeline, map: LeadPipeline}
     */
    private function seedPipelinesAndLabels(): array
    {
        $sales = LeadPipeline::query()->create([
            'company_id' => $this->company->id,
            'name' => 'Sales Pipeline',
            'currency_code' => 'GBP',
            'sort_order' => 0,
            'is_default' => true,
        ]);

        $enterprise = LeadPipeline::query()->create([
            'company_id' => $this->company->id,
            'name' => 'Enterprise Deals',
            'currency_code' => 'GBP',
            'sort_order' => 10,
        ]);

        $map = LeadPipeline::query()->create([
            'company_id' => $this->company->id,
            'name' => MapSavedLeadBridgeService::MAP_PIPELINE_NAME,
            'currency_code' => 'GBP',
            'sort_order' => 20,
            'system_key' => MapSavedLeadBridgeService::MAP_PIPELINE_SYSTEM_KEY,
        ]);

        $labels = [
            ['Hot', '#DC2626'], ['Warm', '#F59E0B'], ['Cold', '#64748B'], ['VIP', '#7C3AED'],
            ['Follow-up', '#2563EB'], ['New Build', '#0891B2'], ['Renewal', '#16A34A'],
            ['Upsell', '#DB2777'], ['Contract', '#4F46E5'], ['Partner', '#059669'],
        ];
        foreach ($labels as $i => [$name, $color]) {
            LeadLabel::query()->create([
                'company_id' => $this->company->id,
                'name' => $name,
                'slug' => Str::slug($name),
                'color' => $color,
                'sort_order' => $i * 10,
                'is_default' => $i < 3,
            ]);
        }

        return ['sales' => $sales, 'enterprise' => $enterprise, 'map' => $map];
    }

    /**
     * @param  array{sales: LeadPipeline, enterprise: LeadPipeline, map: LeadPipeline}  $pipelines
     * @param  array<string, CompanyLocation>  $locations
     * @return list<Lead>
     */
    private function seedLeads(array $pipelines, array $locations): array
    {
        $definitions = [
            // [contact, company, status, priority, source, budget, pipeline, location name|null]
            ['Sarah Ellison', 'Hyde Property Group', 'won', 'high', 'Referral', 48000, 'enterprise', null],
            ['Marcus Webb', 'Canary Retail Partners', 'proposal_sent', 'high', 'Website', 36000, 'enterprise', 'Canary Wharf Client Tower'],
            ['Alistair Finch', 'Finch & Co Estates', 'qualified', 'medium', 'LinkedIn', 15000, 'sales', null],
            ['Nadia Rahman', 'Brick Lane Hospitality', 'contacted', 'medium', 'Event', 9500, 'sales', null],
            ['Peter Kowalski', 'Stratford Retail Trust', 'qualified', 'high', 'Website', 22000, 'sales', 'Westfield Stratford Retail Unit'],
            ['Isabelle Moreau', 'Mayfair Hotel Collection', 'won', 'high', 'Referral', 54000, 'enterprise', 'Mayfair Hotel Client'],
            ['George Adeyemi', 'Southbank Facilities Ltd', 'contacted', 'medium', 'Cold Call', 12000, 'sales', null],
            ['Lucy Chambers', 'Camden Market Traders', 'new', 'medium', 'Website', 7000, 'sales', null],
            ['Rajesh Kumar', 'Docklands Logistics Co', 'proposal_sent', 'high', 'LinkedIn', 41000, 'enterprise', 'Dagenham Distribution Centre'],
            ['Emma Sinclair', 'Westminster Serviced Offices', 'new', 'low', 'Website', 8500, 'sales', 'Westminster Council Office'],
            ['Tomasz Nowak', 'Nowak Construction', 'lost', 'medium', 'Cold Call', 18000, 'sales', null],
            ['Charlotte Reeves', 'Soho Dining Group', 'qualified', 'high', 'Referral', 26000, 'sales', 'Soho Restaurant Group'],
            ['Daniel Okafor', 'Hackney Education Trust', 'contacted', 'medium', 'Event', 13500, 'sales', 'Hackney Academy School'],
            ['Victoria Lang', 'Thames Clinical Services', 'proposal_sent', 'high', 'Referral', 33000, 'enterprise', 'St Thomas\' Hospital Site'],
            ['Ben Hollis', 'Hollis Bros Coffee', 'new', 'low', 'Map', 4000, 'map', null],
            ['Amara Diallo', 'Shoreditch Tech Campus', 'qualified', 'high', 'Map', 29000, 'map', 'Beacon HQ — Shoreditch'],
            ['James Croft', 'Croydon Auto Centres', 'contacted', 'medium', 'Map', 11000, 'map', 'Croydon Service Centre'],
            ['Helena Vasquez', 'Oxford Street Fashion House', 'new', 'medium', 'Map', 16500, 'map', 'Oxford Street Flagship Store'],
        ];

        $leads = [];
        foreach ($definitions as $i => [$contact, $companyName, $status, $priority, $source, $budget, $pipelineKey, $locationName]) {
            $createdAt = $this->now->subDays(80 - $i * 4);
            $assignee = $i % 4 === 0 ? $this->supervisors[$i % 2] : $this->agents[$i % count($this->agents)];
            $location = $locationName !== null ? $locations[$locationName] : null;

            $lead = Lead::query()->create([
                'company_id' => $this->company->id,
                'pipeline_id' => $pipelines[$pipelineKey]->id,
                'company_location_id' => $location?->id,
                'created_by_user_id' => $i % 3 === 0 ? $this->owner()->id : $this->supervisors[$i % 2]->id,
                'assigned_to_user_id' => $assignee->id,
                'name' => $contact,
                'email' => Str::slug($contact, '.').'@'.Str::slug($companyName).'.co.uk',
                'phone' => sprintf('+44 20 8%03d %04d', 200 + $i * 9, 1100 + $i * 53),
                'location' => $companyName.', London',
                'source' => $source,
                'status' => $status,
                'priority' => $priority,
                'budget_amount' => $budget,
                'budget_currency' => 'GBP',
                'next_action' => match ($status) {
                    'new' => 'Book an introductory call',
                    'contacted' => 'Send service overview deck',
                    'qualified' => 'Arrange on-site walkthrough',
                    'proposal_sent' => 'Chase proposal feedback',
                    default => null,
                },
                'last_interaction' => 'Call with '.$contact,
                'last_interaction_at' => $createdAt->addDays(3),
                'converted_at' => $status === 'won' ? $createdAt->addDays(21) : null,
                'meta' => ['company' => $companyName, 'source_detail' => $source],
                'created_at' => $createdAt,
                'updated_at' => $createdAt->addDays(3),
            ]);
            $leads[] = $lead;

            if ($location !== null) {
                $location->forceFill(['crm_lead_id' => $lead->id])->save();
            }
        }

        return $leads;
    }

    /**
     * @param  list<Lead>  $leads
     */
    private function seedLeadNotesAndActivities(array $leads): void
    {
        $noteTexts = [
            'Spoke with the facilities director — keen on weekly reporting.',
            'They compared us with two other providers; pricing is competitive.',
            'Decision committee meets at the end of the month.',
            'Asked for references from similar London retail clients.',
            'Site access requires DBS-checked staff — flagged to operations.',
        ];

        foreach ($leads as $i => $lead) {
            $author = $lead->assigned_to_user_id ?? $this->owner()->id;
            $base = CarbonImmutable::parse($lead->created_at);

            foreach (array_slice($noteTexts, 0, 1 + ($i % 3)) as $n => $text) {
                LeadNote::query()->create([
                    'lead_id' => $lead->id,
                    'company_id' => $this->company->id,
                    'created_by_user_id' => $author,
                    'note' => $text,
                    'created_at' => $base->addDays(2 + $n * 3),
                    'updated_at' => $base->addDays(2 + $n * 3),
                ]);
            }

            $activities = [
                ['call', 'Discovery call', 'Initial 20-minute call to understand site coverage needs.', 1],
                ['email', 'Sent introduction pack', 'Shared the Beacon services overview and pricing bands.', 2],
                ['status_change', 'Stage updated', 'Moved to '.str_replace('_', ' ', $lead->status).' after review.', 5],
            ];
            foreach ($activities as [$type, $title, $description, $offset]) {
                LeadActivity::query()->create([
                    'lead_id' => $lead->id,
                    'company_id' => $this->company->id,
                    'created_by_user_id' => $author,
                    'type' => $type,
                    'title' => $title,
                    'description' => $description,
                    'happened_at' => $base->addDays($offset),
                    'meta' => ['channel' => $type === 'call' ? 'phone' : 'email'],
                ]);
            }
        }
    }

    /**
     * @param  list<Lead>  $leads
     */
    private function seedCrmEmails(array $leads): void
    {
        $owner = $this->owner();

        foreach (array_slice($leads, 0, 12) as $i => $lead) {
            $threadStart = $this->now->subDays(30 - $i * 2);
            $subject = 'Beacon Field Solutions — proposal for '.($lead->meta['company'] ?? $lead->name);

            $thread = CrmEmailThread::query()->create([
                'company_id' => $this->company->id,
                'lead_id' => $lead->id,
                'gmail_thread_id' => 'demo-thread-'.str_pad((string) ($i + 1), 4, '0', STR_PAD_LEFT),
                'subject' => $subject,
                'snippet' => 'Thanks for the walkthrough — attaching our coverage proposal for your London sites…',
                'last_message_at' => $threadStart->addDays(1),
                'unread_count' => $i % 3 === 0 ? 1 : 0,
                'message_count' => 2,
                'participant_emails' => [$owner->email, (string) $lead->email],
            ]);

            $outbound = CrmEmailMessage::query()->create([
                'company_id' => $this->company->id,
                'thread_id' => $thread->id,
                'lead_id' => $lead->id,
                'gmail_message_id' => 'demo-msg-'.($i * 2 + 1),
                'gmail_thread_id' => $thread->gmail_thread_id,
                'direction' => 'sent',
                'status' => 'sent',
                'from_name' => $owner->name,
                'from_email' => $owner->email,
                'to_recipients' => [['email' => (string) $lead->email, 'name' => $lead->name]],
                'subject' => $subject,
                'body_text' => "Hi {$lead->name},\n\nGreat speaking earlier. Attached is our coverage proposal for your London sites, including SLAs and weekly reporting.\n\nBest,\nOliver Bennett",
                'body_html' => "<p>Hi {$lead->name},</p><p>Great speaking earlier. Attached is our coverage proposal for your London sites, including SLAs and weekly reporting.</p><p>Best,<br>Oliver Bennett</p>",
                'is_read' => true,
                'sent_by_user_id' => $owner->id,
                'gmail_account_email' => $owner->email,
                'sent_at' => $threadStart,
            ]);

            CrmEmailMessage::query()->create([
                'company_id' => $this->company->id,
                'thread_id' => $thread->id,
                'lead_id' => $lead->id,
                'gmail_message_id' => 'demo-msg-'.($i * 2 + 2),
                'gmail_thread_id' => $thread->gmail_thread_id,
                'direction' => 'received',
                'status' => 'delivered',
                'from_name' => $lead->name,
                'from_email' => (string) $lead->email,
                'to_recipients' => [['email' => $owner->email, 'name' => $owner->name]],
                'subject' => 'Re: '.$subject,
                'body_text' => "Thanks Oliver — this looks promising. Can we review the SLA terms on a call this week?\n\n{$lead->name}",
                'body_html' => "<p>Thanks Oliver — this looks promising. Can we review the SLA terms on a call this week?</p><p>{$lead->name}</p>",
                'is_read' => $i % 3 !== 0,
                'received_at' => $threadStart->addDays(1),
            ]);

            if ($i < 8) {
                CrmEmailAttachment::query()->create([
                    'company_id' => $this->company->id,
                    'message_id' => $outbound->id,
                    'uploaded_by_user_id' => $owner->id,
                    'filename' => 'beacon-proposal-'.Str::slug($lead->name).'.pdf',
                    'mime_type' => 'application/pdf',
                    'size_bytes' => 384000 + $i * 21000,
                    'storage_disk' => 'local',
                    'storage_path' => 'crm-attachments/demo/proposal-'.($i + 1).'.pdf',
                    'sync_status' => 'uploaded',
                ]);
            }

            foreach ([['sent', $outbound->id], ['received', null]] as [$action, $messageId]) {
                CrmEmailActivityLog::query()->create([
                    'company_id' => $this->company->id,
                    'user_id' => $owner->id,
                    'message_id' => $messageId,
                    'thread_id' => $thread->id,
                    'lead_id' => $lead->id,
                    'action' => $action,
                    'metadata' => ['seeded' => true],
                ]);
            }
        }
    }

    /**
     * @param  list<Project>  $projects
     * @param  list<Lead>  $leads
     */
    private function seedMeetings(array $projects, array $leads): void
    {
        $owner = $this->owner();

        $definitions = [
            // [title, day offset, status]
            ['Weekly ops stand-up', -21, 'completed'],
            ['Hyde Property Group kick-off', -14, 'completed'],
            ['Canary Wharf inspection debrief', -10, 'completed'],
            ['Payroll & attendance review', -7, 'completed'],
            ['Mayfair hotel contract renewal', -3, 'completed'],
            ['Westfield activation planning', -1, 'cancelled'],
            ['Weekly ops stand-up (this week)', 1, 'scheduled'],
            ['Shoreditch Tech Campus walkthrough', 2, 'scheduled'],
            ['Thames Clinical proposal review', 3, 'scheduled'],
            ['Q3 territory planning', 5, 'scheduled'],
            ['Docklands Logistics negotiation', 7, 'scheduled'],
            ['All-hands field team briefing', 9, 'scheduled'],
        ];

        foreach ($definitions as $i => [$title, $dayOffset, $status]) {
            $startAt = $this->now->addDays($dayOffset)->setTime(9 + ($i % 4) * 2, 0);
            $lead = $leads[($i + 2) % count($leads)];

            $meeting = Meeting::query()->create([
                'company_id' => $this->company->id,
                'created_by_user_id' => $owner->id,
                'organizer_user_id' => $owner->id,
                'project_id' => $projects[$i % count($projects)]->id,
                'title' => $title,
                'description' => 'Agenda: progress against plan, blockers, client actions and next steps.',
                'location' => $i % 2 === 0 ? 'Beacon HQ — Boardroom' : 'Google Meet',
                'timezone' => 'Europe/London',
                'start_at' => $startAt,
                'end_at' => $startAt->addMinutes(45),
                'status' => $status,
                'source_page' => 'meetings',
                'organizer_email_snapshot' => $owner->email,
                'organizer_name_snapshot' => $owner->name,
                'reminder_config' => ['offsets' => [30]],
                'sync_status' => 'pending_setup',
            ]);

            $attendees = [
                ['user' => $owner, 'organizer' => true],
                ['user' => $this->supervisors[$i % 2], 'organizer' => false],
                ['user' => $this->agents[$i % count($this->agents)], 'organizer' => false],
            ];
            foreach ($attendees as $a) {
                MeetingAttendee::query()->create([
                    'meeting_id' => $meeting->id,
                    'user_id' => $a['user']->id,
                    'email' => $a['user']->email,
                    'display_name' => $a['user']->name,
                    'response_status' => $status === 'scheduled' ? 'accepted' : 'needs_action',
                    'is_organizer' => $a['organizer'],
                ]);
            }

            // Client-facing meetings also carry the lead as attendee + link.
            if ($i % 2 === 1) {
                MeetingAttendee::query()->create([
                    'meeting_id' => $meeting->id,
                    'lead_id' => $lead->id,
                    'email' => (string) $lead->email,
                    'display_name' => $lead->name,
                    'response_status' => 'accepted',
                    'is_optional' => false,
                ]);
                DB::table('meeting_leads')->insert([
                    'meeting_id' => $meeting->id,
                    'lead_id' => $lead->id,
                    'created_at' => $this->now,
                    'updated_at' => $this->now,
                ]);
            }

            MeetingReminder::query()->create([
                'meeting_id' => $meeting->id,
                'recipient_user_id' => $owner->id,
                'recipient_email' => $owner->email,
                'recipient_name' => $owner->name,
                'offset_minutes' => 30,
                'remind_at' => $startAt->subMinutes(30),
                'status' => $dayOffset < 0 ? 'sent' : 'pending',
                'sent_at' => $dayOffset < 0 ? $startAt->subMinutes(30) : null,
                'dedupe_key' => 'demo-meeting-reminder-'.$meeting->id.'-'.$owner->id,
            ]);
        }
    }

    private function seedKpis(): void
    {
        $definitions = [
            // [name, category, target, priority, status, start offset, end offset]
            ['Close 12 new site contracts', 'sales', '12 contracts', 'high', 'in_progress', -30, 60],
            ['Complete 180 client visits', 'customer_visits', '180 visits', 'high', 'in_progress', -30, 60],
            ['Generate 60 qualified leads', 'lead_generation', '60 leads', 'medium', 'in_progress', -30, 60],
            ['Collect £85k outstanding balances', 'collection', '£85,000', 'critical', 'in_progress', -21, 40],
            ['Survey 40 EV charger sites', 'survey', '40 sites', 'medium', 'pending', 14, 55],
            ['Refresh 25 retail displays', 'merchandising', '25 displays', 'medium', 'in_progress', -14, 30],
            ['Door-to-door: 500 households', 'lead_generation', '500 households', 'medium', 'in_progress', -42, 20],
            ['Reduce average visit time to 55 min', 'customer_visits', '55 minutes', 'low', 'pending', 7, 90],
            ['Win 3 enterprise accounts', 'sales', '3 accounts', 'high', 'in_progress', -60, 30],
            ['Complete NHS compliance audits', 'survey', '18 audits', 'high', 'completed', -75, -5],
            ['Q2 merchandising refresh', 'merchandising', '30 displays', 'medium', 'completed', -100, -40],
            ['Legacy meter collections', 'collection', '£40,000', 'low', 'cancelled', -90, -30],
        ];

        foreach ($definitions as $i => [$name, $category, $target, $priority, $status, $startOffset, $endOffset]) {
            $assignee = $i % 3 === 0 ? $this->supervisors[$i % 2] : $this->agents[$i % count($this->agents)];
            $start = $this->now->addDays($startOffset);
            $end = $this->now->addDays($endOffset);

            Kpi::query()->create([
                'company_id' => $this->company->id,
                'created_by_user_id' => $this->owner()->id,
                'assigned_to_user_id' => $assignee->id,
                'last_status_updated_by_user_id' => $assignee->id,
                'name' => $name,
                'category' => $category,
                'objective' => 'Deliver measurable field performance for the quarter across assigned London territories.',
                'target_value' => $target,
                'expected_outcome' => 'Target met or exceeded with evidence captured in the platform.',
                'priority' => $priority,
                'status' => $status,
                'start_date' => $start->toDateString(),
                'end_date' => $end->toDateString(),
                'started_at' => in_array($status, ['in_progress', 'completed'], true) ? $start : null,
                'completed_at' => $status === 'completed' ? $end : null,
                'cancelled_at' => $status === 'cancelled' ? $this->now->subDays(35) : null,
                'sort_order' => $i * 10,
            ]);
        }
    }

    private function seedAttendanceRecords(): void
    {
        $internalUsers = array_merge($this->agents, $this->supervisors);
        $rows = [];
        $day = $this->now->startOfDay();
        $workdaysSeeded = 0;

        while ($workdaysSeeded < 12) {
            if ($day->isWeekend()) {
                $day = $day->subDay();

                continue;
            }

            foreach ($internalUsers as $i => $user) {
                $seed = ($workdaysSeeded * 7 + $i) % 10;
                $isToday = $workdaysSeeded === 0;
                $isLate = $seed === 3;
                $isAbsent = $seed === 7 && ! $isToday;
                if ($isAbsent) {
                    continue;
                }

                $clockIn = $day->setTime(8, $isLate ? 52 : 20 + ($seed * 2));
                $clockOut = $isToday ? null : $day->setTime(17, 25 + ($seed % 20));
                $isAutoOut = ! $isToday && $seed === 5;

                $rows[] = [
                    'company_id' => $this->company->id,
                    'user_id' => $user->id,
                    'attendance_date' => $day->toDateString(),
                    'clock_in_at' => $clockIn,
                    'clock_out_at' => $clockOut,
                    'status' => $isAutoOut ? 'auto_clocked_out' : ($isLate ? 'late' : 'present'),
                    'work_duration_minutes' => $clockOut !== null ? $clockIn->diffInMinutes($clockOut) : null,
                    'is_late' => $isLate,
                    'is_auto_clocked_out' => $isAutoOut,
                    'metadata' => json_encode(['seeded' => true]),
                    'created_at' => $clockIn,
                    'updated_at' => $clockOut ?? $clockIn,
                ];
            }

            $workdaysSeeded++;
            $day = $day->subDay();
        }

        DB::table('attendance_records')->insert($rows);
    }

    private function seedPayrollSummaries(): void
    {
        $payrollSetting = PayrollSetting::query()->where('company_id', $this->company->id)->first();
        $internalUsers = array_merge($this->agents, $this->supervisors);

        foreach ([2, 1] as $monthsAgo) {
            $periodStart = $this->now->subMonths($monthsAgo)->startOfMonth();
            $periodEnd = $periodStart->endOfMonth();
            $isApproved = $monthsAgo === 2;

            foreach ($internalUsers as $i => $user) {
                $scheduled = 22;
                $attended = 19 + ($i % 4);
                $base = (float) ($user->base_salary ?? 2400);
                $dailyRate = round($base / $scheduled, 2);

                AttendancePayrollSummary::query()->create([
                    'company_id' => $this->company->id,
                    'user_id' => $user->id,
                    'payroll_setting_id' => $payrollSetting?->id,
                    'cycle_type' => 'monthly',
                    'period_year' => $periodStart->year,
                    'period_month' => $periodStart->month,
                    'period_start' => $periodStart->toDateString(),
                    'period_end' => $periodEnd->toDateString(),
                    'attendance_days' => min($attended, $scheduled),
                    'scheduled_work_days' => $scheduled,
                    'daily_rate' => $dailyRate,
                    'salary_payable' => round($dailyRate * min($attended, $scheduled), 2),
                    'currency' => 'GBP',
                    'status' => $isApproved ? 'approved' : 'pending',
                    'approved_at' => $isApproved ? $periodEnd->addDays(2) : null,
                    'approved_by_user_id' => $isApproved ? $this->owner()->id : null,
                    'generated_at' => $periodEnd->addDay(),
                    'metadata' => ['seeded' => true],
                ]);
            }
        }
    }

    private function seedNotifications(): void
    {
        $owner = $this->owner();

        $definitions = [
            // [recipient, type, category, title, message, priority, hours ago, read]
            [$owner, 'task.completed', 'task', 'Task completed', 'Harry Walker completed "Merchandising audit — Oxford Street flagship".', 'normal', 2, false],
            [$owner, 'task.completed', 'task', 'Task completed', 'Emily Watson completed "POS installation check — Soho Dean Street".', 'normal', 5, false],
            [$owner, 'crm.lead_won', 'crm', 'Lead won', 'Mayfair Hotel Collection accepted the annual coverage proposal (£54,000).', 'high', 8, false],
            [$owner, 'payroll.monthly_salary_generated', 'payroll', 'Payroll generated', 'Monthly payroll summaries were generated for 16 team members.', 'high', 26, true],
            [$owner, 'attendance.issue_alert', 'attendance', 'Late clock-in', 'Callum Doyle clocked in late at 08:52 today.', 'normal', 30, true],
            [$owner, 'tracking.arrival', 'tracking', 'Agent arrived on site', 'Megan Foster arrived at Canary Wharf Client Tower.', 'normal', 3, false],
            [$this->supervisors[0], 'task.reassignment_requested', 'task', 'Reassignment pending', 'Two task reassignments are awaiting agent responses.', 'normal', 6, false],
            [$this->supervisors[0], 'task.overdue', 'task', 'Task overdue', '"Minibar restock — Mayfair hotel floors 3-5" passed its due time while paused.', 'high', 12, false],
            [$this->supervisors[1], 'crm.lead_assigned', 'crm', 'Lead assigned', 'You were assigned the Thames Clinical Services opportunity.', 'normal', 20, true],
            [$this->supervisors[1], 'project.status_updated', 'project', 'Project update', 'Hotel Minibar Restock Programme was marked completed.', 'low', 40, true],
            [$owner, 'workforce.invite_accepted', 'workforce', 'Invitation accepted', 'Priya Patel accepted the team invitation and completed onboarding.', 'normal', 60, true],
            [$owner, 'system.subscription_active', 'system', 'Subscription active', 'Your Up to 100 users plan is active.', 'low', 90, true],
        ];

        foreach ($this->agents as $i => $agent) {
            $definitions[] = [$agent, 'task.assigned', 'task', 'New task assigned', 'You have a new task in your queue for this week.', 'normal', 4 + $i, $i % 2 === 0];
        }

        foreach ($definitions as $i => [$recipient, $type, $category, $title, $message, $priority, $hoursAgo, $read]) {
            $createdAt = $this->now->subHours($hoursAgo);
            AppNotification::query()->create([
                'user_id' => $recipient->id,
                'company_id' => $this->company->id,
                'type' => $type,
                'category' => $category,
                'title' => $title,
                'message' => $message,
                'priority' => $priority,
                'delivery_types' => ['in_app'],
                'is_in_app_visible' => true,
                'is_read' => $read,
                'read_at' => $read ? $createdAt->addHours(1) : null,
                'dedupe_key' => 'demo-notification-'.$i,
                'created_at' => $createdAt,
                'updated_at' => $createdAt,
            ]);
        }

        $categories = ['task', 'project', 'tracking', 'attendance', 'payroll', 'crm', 'workforce', 'system'];
        foreach ([$owner, ...$this->supervisors] as $user) {
            foreach ($categories as $category) {
                NotificationPreference::query()->create([
                    'user_id' => $user->id,
                    'company_id' => $this->company->id,
                    'category' => $category,
                    'is_enabled' => true,
                    'in_app_enabled' => true,
                    'push_enabled' => $category !== 'system',
                    'email_enabled' => in_array($category, ['payroll', 'crm', 'system'], true),
                ]);
            }
        }
    }

    private function seedPushSubscriptions(): void
    {
        foreach ($this->agents as $i => $agent) {
            $token = 'demo-device-'.Str::lower(Str::random(32));
            PushSubscription::query()->create([
                'user_id' => $agent->id,
                'company_id' => $this->company->id,
                'provider' => 'fcm',
                'platform' => $i % 3 === 0 ? 'ios' : 'android',
                'device_token' => $token,
                'device_token_hash' => hash('sha256', $token),
                'user_agent' => $i % 3 === 0 ? 'FactoryAgent/2.4 (iPhone 15)' : 'FactoryAgent/2.4 (Pixel 8)',
                'is_active' => true,
                'last_seen_at' => $this->now->subMinutes(5 + $i * 7),
            ]);
        }
    }

    private function seedAi(): void
    {
        $rules = [
            ['Morning route briefing', 'Every weekday at 08:00 send agents a summary of their tasks for the day.', 'schedule', '0 8 * * 1-5', 'notifications.send'],
            ['Overdue task escalation', 'When a task passes its due time, notify the supervisor for that zone.', 'event', 'task.overdue', 'notifications.send'],
            ['Friday pipeline digest', 'Every Friday at 16:00 send the owner a summary of pipeline movement this week.', 'schedule', '0 16 * * 5', 'notifications.send'],
            ['Auto-create follow-up visits', 'When a lead reaches proposal_sent, create a follow-up visit task for the assigned agent.', 'event', 'lead.status_changed', 'tasks.create'],
            ['Weekly territory planning meeting', 'Every Monday at 09:00 schedule the ops stand-up with both supervisors.', 'schedule', '0 9 * * 1', 'meetings.schedule'],
            ['Idle agent rebalance', 'If an agent has no active task after 10:00, propose a reassignment from the busiest queue.', 'event', 'agent.idle', 'tasks.reassign'],
            ['New enterprise lead project', 'When an enterprise lead is won, create an onboarding project from the standard template.', 'event', 'lead.won', 'projects.create'],
            ['Attendance anomaly alert', 'Alert the admin when three or more late clock-ins occur on the same day.', 'event', 'attendance.late_pattern', 'notifications.send'],
            ['Month-end payroll reminder', 'On the last weekday of the month remind the owner to approve payroll summaries.', 'schedule', '0 9 28-31 * *', 'notifications.send'],
            ['Stale lead nudge', 'When a lead has no interaction for 14 days, notify the assigned user.', 'event', 'lead.stale', 'notifications.send'],
        ];

        foreach ($rules as $i => [$name, $prompt, $triggerType, $expression, $tool]) {
            AiAutomationRule::query()->create([
                'company_id' => $this->company->id,
                'created_by_user_id' => $this->owner()->id,
                'name' => $name,
                'prompt' => $prompt,
                'trigger_type' => $triggerType,
                'trigger_expression' => $expression,
                'action_tool' => $tool,
                'action_args' => ['seeded' => true],
                'status' => $i === 9 ? 'paused' : 'active',
                'last_run_at' => $triggerType === 'schedule' ? $this->now->subDay() : null,
            ]);
        }

        $prompts = [
            'Summarise today\'s completed visits across Central London.',
            'Which agents are closest to Canary Wharf right now?',
            'Draft a follow-up email for the Thames Clinical proposal.',
            'How many leads moved stage this week?',
            'Create a task for a site survey at the Hackney Academy on Friday.',
            'What is the attendance rate for the last 10 working days?',
            'List overdue tasks grouped by supervisor.',
            'Compare this month\'s payroll total to last month.',
            'Who has the highest visit completion rate this quarter?',
            'Schedule a meeting with both supervisors for Monday 9am.',
        ];

        foreach ($prompts as $i => $prompt) {
            $startedAt = $this->now->subHours(2 + $i * 5);
            $sessionUser = $i % 3 === 0 ? $this->owner() : $this->supervisors[$i % 2];
            $inputTokens = 420 + $i * 60;
            $outputTokens = 180 + $i * 35;

            foreach ([0, 1] as $r) {
                AiLog::query()->create([
                    'company_id' => $this->company->id,
                    'user_id' => $sessionUser->id,
                    'session_id' => 'demo-session-'.($i + 1),
                    'provider' => $r === 0 ? 'anthropic' : 'openai',
                    'model' => $r === 0 ? 'claude-sonnet-5' : 'gpt-4o-mini',
                    'user_prompt' => $prompt,
                    'sanitized_prompt' => $prompt,
                    'prompt_length' => strlen($prompt),
                    'input_tokens' => $inputTokens,
                    'output_tokens' => $outputTokens,
                    'total_tokens' => $inputTokens + $outputTokens,
                    'estimated_cost_usd' => round(($inputTokens + $outputTokens) * 0.000004, 6),
                    'started_at' => $startedAt->addSeconds($r * 4),
                    'ended_at' => $startedAt->addSeconds($r * 4 + 3),
                    'execution_ms' => 2400 + $i * 180,
                    'status' => $i === 8 && $r === 1 ? 'failed' : 'success',
                    'intent_type' => $i % 2 === 0 ? 'insight' : 'action',
                    'tool_name' => $i % 2 === 0 ? null : 'tasks.create',
                    'routing_purpose' => $r === 0 ? 'copilot_chat' : 'intent_routing',
                    'error_code' => $i === 8 && $r === 1 ? 'rate_limited' : null,
                    'error_message' => $i === 8 && $r === 1 ? 'Provider rate limit reached, retried successfully.' : null,
                ]);
            }
        }
    }

    private function owner(): User
    {
        return $this->people['oliver.bennett'];
    }
}
