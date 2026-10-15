<?php

namespace App\Http\Controllers;

use App\Models\Score;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ScoreController extends Controller
{
    /**
     * Record a finished game. Called by the game over fetch() in tetris.js.
     * Returns the player's best for that mode so the sidebar can update
     * without a reload.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'mode' => ['sometimes', Rule::in(Score::MODES)],
            'score' => ['required', 'integer', 'min:0', 'max:100000000'],
            'lines' => ['required', 'integer', 'min:0', 'max:100000'],
            'level' => ['required', 'integer', 'min:1', 'max:1000'],
            'duration_ms' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:86400000'],
        ]);

        $data['mode'] ??= 'marathon';

        $user = $request->user();

        // Compare against the previous best before this one is stored, so a
        // tie with yourself still reads as "new best" only the first time.
        $previous = $user->scores()->ranked($data['mode'])->first();

        $score = $user->scores()->create($data);

        $isBest = $score->beats($previous);
        $best = $isBest ? $score : $previous;

        return response()->json([
            'saved' => true,
            'id' => $score->id,
            'mode' => $score->mode,
            'best' => $best->score,
            'best_duration_ms' => $best->duration_ms,
            'is_best' => $isBest,
        ], 201);
    }
}
