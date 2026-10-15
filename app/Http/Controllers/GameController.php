<?php

namespace App\Http\Controllers;

use App\Models\Score;
use Illuminate\Http\Request;
use Illuminate\View\View;

class GameController extends Controller
{
    public function index(Request $request): View
    {
        $leaderboard = Score::with('user:id,name')
            ->orderByDesc('score')
            ->orderBy('created_at')
            ->limit(10)
            ->get();

        $best = $request->user()
            ? $request->user()->scores()->orderByDesc('score')->first()
            : null;

        return view('tetris', [
            'leaderboard' => $leaderboard,
            'best' => $best,
        ]);
    }
}
