<?php

namespace App\Http\Controllers;

use App\Models\Score;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ScoreController extends Controller
{
    /**
     * Record a finished game. Called by the game over fetch() in tetris.js.
     * Returns the player's best so the sidebar can update without a reload.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'score' => ['required', 'integer', 'min:0', 'max:100000000'],
            'lines' => ['required', 'integer', 'min:0', 'max:100000'],
            'level' => ['required', 'integer', 'min:1', 'max:1000'],
        ]);

        $score = $request->user()->scores()->create($data);

        $best = $request->user()->scores()->max('score');

        return response()->json([
            'saved' => true,
            'id' => $score->id,
            'best' => $best,
            'is_best' => $score->score >= $best,
        ], 201);
    }
}
