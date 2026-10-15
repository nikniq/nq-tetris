<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['user_id', 'mode', 'score', 'lines', 'level', 'duration_ms'])]
class Score extends Model
{
    public const MODES = ['marathon', 'sprint', 'ultra'];

    public const SPRINT_LINES = 40;

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Order a query so the "best" result of a mode comes first: fastest
     * completed sprint, otherwise highest score.
     */
    public function scopeRanked(Builder $query, string $mode): Builder
    {
        $query->where('mode', $mode);

        if ($mode === 'sprint') {
            return $query->where('lines', '>=', self::SPRINT_LINES)
                ->whereNotNull('duration_ms')
                ->orderBy('duration_ms')
                ->orderBy('created_at');
        }

        return $query->orderByDesc('score')->orderBy('created_at');
    }

    /**
     * True when this result beats (or ties) the other one for its mode.
     */
    public function beats(?Score $other): bool
    {
        if ($other === null) {
            return true;
        }

        if ($this->mode === 'sprint') {
            return $this->duration_ms !== null && $this->duration_ms <= $other->duration_ms;
        }

        return $this->score >= $other->score;
    }
}
