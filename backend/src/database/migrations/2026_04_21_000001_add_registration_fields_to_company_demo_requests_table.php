<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('company_demo_requests', function (Blueprint $table): void {
            $table->string('registration_purpose')->nullable()->after('use_case');
            $table->string('registration_user_type')->nullable()->after('registration_purpose');
        });
    }

    public function down(): void
    {
        Schema::table('company_demo_requests', function (Blueprint $table): void {
            $table->dropColumn(['registration_purpose', 'registration_user_type']);
        });
    }
};
