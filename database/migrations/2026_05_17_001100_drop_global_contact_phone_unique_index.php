<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! $this->hasUniqueIndex(['user_id', 'phone_number'])) {
            return;
        }

        Schema::table('contacts', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'phone_number']);
        });
    }

    public function down(): void
    {
        if ($this->hasUniqueIndex(['user_id', 'phone_number'])) {
            return;
        }

        Schema::table('contacts', function (Blueprint $table) {
            $table->unique(['user_id', 'phone_number']);
        });
    }

    private function hasUniqueIndex(array $columns): bool
    {
        foreach (Schema::getIndexes('contacts') as $index) {
            if (
                ($index['unique'] ?? false)
                && array_values($index['columns'] ?? []) === $columns
            ) {
                return true;
            }
        }

        return false;
    }
};
