<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('scores', function (Blueprint $table) {
            // marathon (endless), sprint (40 lines, fastest wins), ultra (2 min, most points)
            $table->string('mode', 16)->default('marathon')->after('user_id');
            // Game length in milliseconds; the Sprint leaderboard sorts by it.
            $table->unsignedInteger('duration_ms')->nullable()->after('level');
            $table->index(['mode', 'score']);
            $table->index(['mode', 'duration_ms']);
        });
    }

    public function down(): void
    {
        Schema::table('scores', function (Blueprint $table) {
            $table->dropIndex(['mode', 'score']);
            $table->dropIndex(['mode', 'duration_ms']);
            $table->dropColumn(['mode', 'duration_ms']);
        });
    }
};
