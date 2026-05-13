<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table): void {
            $table->string('type')->nullable()->change();
            $table->text('description')->nullable()->change();
            $table->text('location_text')->nullable()->change();
            $table->text('address_full')->nullable()->change();
            $table->dateTime('due_at')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table): void {
            $table->string('type')->nullable(false)->change();
            $table->text('description')->nullable(false)->change();
            $table->text('location_text')->nullable(false)->change();
            $table->text('address_full')->nullable(false)->change();
            $table->dateTime('due_at')->nullable(false)->change();
        });
    }
};
