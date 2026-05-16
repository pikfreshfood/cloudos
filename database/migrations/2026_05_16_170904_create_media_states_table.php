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
        Schema::create('media_states', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('device_id')->nullable()->constrained('devices')->cascadeOnDelete();
            $table->string('media_type'); // 'music' or 'video'
            $table->string('media_path');
            $table->string('media_title')->nullable();
            $table->bigInteger('position_ms')->default(0);
            $table->bigInteger('duration_ms')->default(0);
            $table->string('playback_status')->default('stopped'); // 'playing', 'paused', 'stopped'
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'media_type', 'media_path']);
            $table->index(['user_id', 'device_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('media_states');
    }
};
