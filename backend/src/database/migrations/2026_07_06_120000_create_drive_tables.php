<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('drive_folders', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('parent_id')->nullable()->constrained('drive_folders')->nullOnDelete();
            $table->string('name');
            $table->boolean('is_system')->default(false);
            $table->string('system_key')->nullable();
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['company_id', 'system_key']);
            $table->index(['company_id', 'parent_id']);
        });

        Schema::create('drive_files', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('folder_id')->constrained('drive_folders')->cascadeOnDelete();
            $table->string('disk', 32);
            $table->string('file_path');
            $table->string('original_name');
            $table->string('mime_type', 191)->nullable();
            $table->unsignedBigInteger('size_bytes')->default(0);
            $table->string('source', 32)->default('manual');
            $table->uuid('ely_report_id')->nullable();
            $table->json('metadata')->nullable();
            $table->foreignId('uploaded_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['company_id', 'folder_id']);
            $table->index(['company_id', 'ely_report_id']);
        });

        Schema::create('drive_file_grants', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('drive_file_id')->constrained('drive_files')->cascadeOnDelete();
            $table->string('grantee_type', 16);
            $table->foreignId('user_id')->nullable()->constrained('users')->cascadeOnDelete();
            $table->foreignId('granted_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['drive_file_id', 'grantee_type', 'user_id']);
            $table->index(['drive_file_id', 'grantee_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('drive_file_grants');
        Schema::dropIfExists('drive_files');
        Schema::dropIfExists('drive_folders');
    }
};
