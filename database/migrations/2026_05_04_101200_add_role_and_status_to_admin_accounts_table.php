<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('admin_accounts', function (Blueprint $table) {
            if (! Schema::hasColumn('admin_accounts', 'role')) {
                $table->string('role')->default('super_admin')->after('password');
            }

            if (! Schema::hasColumn('admin_accounts', 'status')) {
                $table->string('status')->default('active')->after('role');
            }
        });
    }

    public function down(): void
    {
        Schema::table('admin_accounts', function (Blueprint $table) {
            if (Schema::hasColumn('admin_accounts', 'status')) {
                $table->dropColumn('status');
            }

            if (Schema::hasColumn('admin_accounts', 'role')) {
                $table->dropColumn('role');
            }
        });
    }
};
