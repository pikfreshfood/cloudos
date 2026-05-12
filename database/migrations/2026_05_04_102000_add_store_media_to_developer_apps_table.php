<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('developer_apps', function (Blueprint $table) {
            $table->json('screenshots')->nullable()->after('app_icon_path');
            $table->unsignedBigInteger('app_icon_size_bytes')->default(0)->after('screenshots');
        });
    }

    public function down(): void
    {
        Schema::table('developer_apps', function (Blueprint $table) {
            $table->dropColumn(['screenshots', 'app_icon_size_bytes']);
        });
    }
};
