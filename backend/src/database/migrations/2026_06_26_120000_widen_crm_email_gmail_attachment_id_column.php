<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('crm_email_attachments', function (Blueprint $table): void {
            $table->text('gmail_attachment_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('crm_email_attachments', function (Blueprint $table): void {
            $table->string('gmail_attachment_id')->nullable()->change();
        });
    }
};
