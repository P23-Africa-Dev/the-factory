<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Trip reports: what the person did at each stop.
 *
 * - field_stops: the record (activity = existing classification, outcome,
 *   notes, follow-up date), whether the place was confirmed or corrected (the
 *   detected position is kept in original_*), and stops added by the user.
 * - field_stop_attachments: photos and documents per stop (private disk).
 * - field_activity_sessions: report status and the AI trip summary.
 * - companies: whether a report is required before the next trip.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('field_stops', function (Blueprint $table): void {
            $table->string('source', 16)->default('detected')->after('user_id');
            $table->string('client_stop_id', 64)->nullable()->after('source');
            $table->string('outcome', 32)->nullable()->after('classified_at');
            $table->text('notes')->nullable()->after('outcome');
            $table->date('follow_up_at')->nullable()->after('notes');
            $table->string('record_status', 16)->default('pending')->after('follow_up_at');
            $table->timestamp('recorded_at')->nullable()->after('record_status');
            $table->string('recorded_via', 16)->nullable()->after('recorded_at');
            $table->string('location_status', 16)->default('unconfirmed')->after('recorded_via');
            $table->decimal('original_latitude', 10, 7)->nullable()->after('location_status');
            $table->decimal('original_longitude', 10, 7)->nullable()->after('original_latitude');
            $table->string('original_address', 512)->nullable()->after('original_longitude');
            $table->unique(['field_activity_session_id', 'client_stop_id'], 'field_stops_session_client_unique');
            $table->index(['field_activity_session_id', 'record_status'], 'field_stops_session_record_idx');
        });

        Schema::create('field_stop_attachments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('field_stop_id')->constrained('field_stops')->cascadeOnDelete();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('client_attachment_id', 64)->nullable();
            $table->string('disk', 32);
            $table->string('file_path', 512);
            $table->string('mime_type', 120)->nullable();
            $table->unsignedBigInteger('size_bytes')->default(0);
            $table->string('original_name', 255)->nullable();
            $table->string('caption', 500)->nullable();
            $table->timestamp('captured_at')->nullable();
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->timestamps();
            $table->unique(['field_stop_id', 'client_attachment_id'], 'field_stop_attachments_client_unique');
        });

        Schema::table('field_activity_sessions', function (Blueprint $table): void {
            $table->string('report_status', 16)->default('none')->after('end_reason');
            $table->timestamp('report_submitted_at')->nullable()->after('report_status');
            $table->unsignedTinyInteger('report_reminders_sent')->default(0)->after('report_submitted_at');
            $table->timestamp('report_last_reminded_at')->nullable()->after('report_reminders_sent');
            $table->json('ai_summary')->nullable()->after('report_last_reminded_at');
            $table->timestamp('ai_summary_at')->nullable()->after('ai_summary');
            $table->index(['user_id', 'company_id', 'report_status'], 'field_sessions_user_report_idx');
        });

        Schema::table('companies', function (Blueprint $table): void {
            $table->string('field_trip_report_policy', 16)->default('required');
        });

        // Notes typed in the old "classify" flow become the stop's notes.
        DB::table('field_stops')
            ->whereNotNull('meta')
            ->orderBy('id')
            ->chunkById(500, function ($stops): void {
                foreach ($stops as $stop) {
                    $meta = json_decode((string) $stop->meta, true);
                    $note = is_array($meta) ? trim((string) ($meta['agent_note'] ?? '')) : '';
                    if ($note !== '') {
                        DB::table('field_stops')->where('id', $stop->id)->update(['notes' => $note]);
                    }
                }
            });
    }

    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table): void {
            $table->dropColumn('field_trip_report_policy');
        });
        Schema::table('field_activity_sessions', function (Blueprint $table): void {
            $table->dropIndex('field_sessions_user_report_idx');
            $table->dropColumn(['report_status', 'report_submitted_at', 'report_reminders_sent', 'report_last_reminded_at', 'ai_summary', 'ai_summary_at']);
        });
        Schema::dropIfExists('field_stop_attachments');
        Schema::table('field_stops', function (Blueprint $table): void {
            $table->dropUnique('field_stops_session_client_unique');
            $table->dropIndex('field_stops_session_record_idx');
            $table->dropColumn([
                'source', 'client_stop_id', 'outcome', 'notes', 'follow_up_at', 'record_status', 'recorded_at',
                'recorded_via', 'location_status', 'original_latitude', 'original_longitude', 'original_address',
            ]);
        });
    }
};
