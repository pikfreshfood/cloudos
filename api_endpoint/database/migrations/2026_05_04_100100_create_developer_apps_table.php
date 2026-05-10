<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('developer_apps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('developer_profile_id')->constrained('developer_profiles')->cascadeOnDelete();
            $table->string('app_name');
            $table->string('app_icon_path')->nullable();
            $table->string('app_url', 1200);
            $table->string('environment')->default('production');
            $table->string('status')->default('pending');
            $table->text('admin_note')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('developer_apps');
    }
};
