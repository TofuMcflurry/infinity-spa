<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── bookings ──────────────────────────────────────────────────────────
        // Most queried table — status, therapist, customer, service filters
        Schema::table('bookings', function (Blueprint $table) {
            $table->index('status',             'idx_bookings_status');
            $table->index('customer_id',        'idx_bookings_customer');
            $table->index('therapist_id',       'idx_bookings_therapist');
            $table->index('service_id',         'idx_bookings_service');
            $table->index('service_variant_id', 'idx_bookings_variant');
            $table->index('scheduled_start',    'idx_bookings_scheduled');
            $table->index('created_at',         'idx_bookings_created');
            $table->index('downpayment_status', 'idx_bookings_downpayment');
            // Composite: most common admin query — status + date
            $table->index(['status', 'created_at'], 'idx_bookings_status_created');
        });

        // ── services ──────────────────────────────────────────────────────────
        Schema::table('services', function (Blueprint $table) {
            $table->index('is_active',   'idx_services_active');
            $table->index('archived_at', 'idx_services_archived');
            $table->index('group_name',  'idx_services_group');
        });

        // ── service_variants ──────────────────────────────────────────────────
        Schema::table('service_variants', function (Blueprint $table) {
            $table->index('service_id', 'idx_variants_service');
            $table->index('is_active',  'idx_variants_active');
        });

        // ── therapists ────────────────────────────────────────────────────────
        Schema::table('therapists', function (Blueprint $table) {
            $table->index('is_active',  'idx_therapists_active');
            $table->index('is_flagged', 'idx_therapists_flagged');
            $table->index('rating',     'idx_therapists_rating');
        });

        // ── users ─────────────────────────────────────────────────────────────
        Schema::table('users', function (Blueprint $table) {
            $table->index('role',       'idx_users_role');
            $table->index('is_blocked', 'idx_users_blocked');
            // Composite: customer list query — role + blocked status
            $table->index(['role', 'is_blocked'], 'idx_users_role_blocked');
        });

        // ── reviews ───────────────────────────────────────────────────────────
        Schema::table('reviews', function (Blueprint $table) {
            $table->index('therapist_id',  'idx_reviews_therapist');
            $table->index('customer_id',   'idx_reviews_customer');
            $table->index('is_visible',    'idx_reviews_visible');
            $table->index('service_group', 'idx_reviews_group');
            // Composite: CSAT query — therapist + visible
            $table->index(['therapist_id', 'is_visible'], 'idx_reviews_therapist_visible');
        });

        // ── audit_logs ────────────────────────────────────────────────────────
        // Already has indexes from creation migration, adding composite
        Schema::table('audit_logs', function (Blueprint $table) {
            // Composite: most common audit filter — event + created_at
            $table->index(['event', 'created_at'], 'idx_audit_event_created');
            // Composite: role + created_at for admin actions filter
            $table->index(['user_role', 'created_at'], 'idx_audit_role_created');
        });

        // ── user_reports ──────────────────────────────────────────────────────
        Schema::table('user_reports', function (Blueprint $table) {
            $table->index('reported_user_id', 'idx_reports_reported');
            $table->index('reporter_id',      'idx_reports_reporter');
            $table->index('status',           'idx_reports_status');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropIndex('idx_bookings_status');
            $table->dropIndex('idx_bookings_customer');
            $table->dropIndex('idx_bookings_therapist');
            $table->dropIndex('idx_bookings_service');
            $table->dropIndex('idx_bookings_variant');
            $table->dropIndex('idx_bookings_scheduled');
            $table->dropIndex('idx_bookings_created');
            $table->dropIndex('idx_bookings_downpayment');
            $table->dropIndex('idx_bookings_status_created');
        });

        Schema::table('services', function (Blueprint $table) {
            $table->dropIndex('idx_services_active');
            $table->dropIndex('idx_services_archived');
            $table->dropIndex('idx_services_group');
        });

        Schema::table('service_variants', function (Blueprint $table) {
            $table->dropIndex('idx_variants_service');
            $table->dropIndex('idx_variants_active');
        });

        Schema::table('therapists', function (Blueprint $table) {
            $table->dropIndex('idx_therapists_active');
            $table->dropIndex('idx_therapists_flagged');
            $table->dropIndex('idx_therapists_rating');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex('idx_users_role');
            $table->dropIndex('idx_users_blocked');
            $table->dropIndex('idx_users_role_blocked');
        });

        Schema::table('reviews', function (Blueprint $table) {
            $table->dropIndex('idx_reviews_therapist');
            $table->dropIndex('idx_reviews_customer');
            $table->dropIndex('idx_reviews_visible');
            $table->dropIndex('idx_reviews_group');
            $table->dropIndex('idx_reviews_therapist_visible');
        });

        Schema::table('audit_logs', function (Blueprint $table) {
            $table->dropIndex('idx_audit_event_created');
            $table->dropIndex('idx_audit_role_created');
        });

        Schema::table('user_reports', function (Blueprint $table) {
            $table->dropIndex('idx_reports_reported');
            $table->dropIndex('idx_reports_reporter');
            $table->dropIndex('idx_reports_status');
        });
    }
};