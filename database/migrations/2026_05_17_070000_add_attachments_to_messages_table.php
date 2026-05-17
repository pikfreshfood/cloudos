<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            if (! Schema::hasColumn('messages', 'attachment_path')) {
                $table->string('attachment_path')->nullable()->after('body');
            }

            if (! Schema::hasColumn('messages', 'attachment_name')) {
                $table->string('attachment_name')->nullable()->after('attachment_path');
            }

            if (! Schema::hasColumn('messages', 'attachment_mime')) {
                $table->string('attachment_mime', 100)->nullable()->after('attachment_name');
            }
        });
    }

    public function down(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            if (Schema::hasColumn('messages', 'attachment_mime')) {
                $table->dropColumn('attachment_mime');
            }

            if (Schema::hasColumn('messages', 'attachment_name')) {
                $table->dropColumn('attachment_name');
            }

            if (Schema::hasColumn('messages', 'attachment_path')) {
                $table->dropColumn('attachment_path');
            }
        });
    }
};
