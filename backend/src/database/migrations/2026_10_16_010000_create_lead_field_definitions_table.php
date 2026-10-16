<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lead_field_definitions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->string('key', 64);
            $table->string('label', 80);
            $table->string('description', 255)->nullable();
            $table->string('type', 32);
            $table->json('options')->nullable();
            $table->boolean('is_required')->default(false);
            $table->boolean('show_on_create')->default(true);
            $table->boolean('show_in_list')->default(true);
            $table->string('status', 20)->default('active');
            $table->unsignedInteger('sort_order')->default(0);
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('reviewed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->string('decline_reason', 255)->nullable();
            $table->timestamps();

            $table->unique(['company_id', 'key']);
            $table->index(['company_id', 'status', 'sort_order']);
        });

        Schema::table('leads', function (Blueprint $table): void {
            $table->json('custom_fields')->nullable()->after('meta');
        });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table): void {
            $table->dropColumn('custom_fields');
        });

        Schema::dropIfExists('lead_field_definitions');
    }
};
