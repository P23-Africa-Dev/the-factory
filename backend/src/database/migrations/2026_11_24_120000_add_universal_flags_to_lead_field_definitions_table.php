<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lead_field_definitions', function (Blueprint $table): void {
            $table->boolean('is_universal')->default(false)->after('show_in_list');
            $table->string('universal_request_status', 20)->nullable()->after('is_universal');
        });

        // Existing active fields stay on every form. Pending agent proposals become
        // lead-only fields with a universal approval request.
        DB::table('lead_field_definitions')
            ->where('status', 'active')
            ->update([
                'is_universal' => true,
                'universal_request_status' => 'approved',
            ]);

        DB::table('lead_field_definitions')
            ->where('status', 'pending')
            ->update([
                'status' => 'active',
                'is_universal' => false,
                'universal_request_status' => 'pending',
                'show_on_create' => false,
                'show_in_list' => false,
            ]);
    }

    public function down(): void
    {
        DB::table('lead_field_definitions')
            ->where('universal_request_status', 'pending')
            ->where('is_universal', false)
            ->update(['status' => 'pending']);

        Schema::table('lead_field_definitions', function (Blueprint $table): void {
            $table->dropColumn(['is_universal', 'universal_request_status']);
        });
    }
};
