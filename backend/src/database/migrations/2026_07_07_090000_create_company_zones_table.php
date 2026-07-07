<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('company_zones', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('normalized_name', 140);
            $table->string('country_code', 3);
            $table->string('state_name', 120);
            $table->string('lga_name', 120);
            $table->boolean('is_active')->default(true);
            $table->json('meta')->nullable();
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['company_id', 'normalized_name'], 'company_zones_company_normalized_unique');
            $table->index(['company_id', 'is_active']);
            $table->index(['company_id', 'country_code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('company_zones');
    }
};

