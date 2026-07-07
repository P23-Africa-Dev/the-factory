<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('task_reassignments', function (Blueprint $table) {
            $table->string('action_token', 64)->change();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('task_reassignments', function (Blueprint $table) {
            $table->string('action_token', 32)->change(); // Replace 32 with your original length
        });
    }
};
