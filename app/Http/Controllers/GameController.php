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

        $best = null;
        $stats = null;

        if ($user = $request->user()) {
            $best = $user->scores()->orderByDesc('score')->first();
            $row = $user->scores()
                ->selectRaw('count(*) as games, coalesce(sum(lines), 0) as lines, coalesce(max(level), 1) as level, coalesce(avg(score), 0) as average')
                ->first();
            $stats = [
                'games' => (int) $row->games,
                'lines' => (int) $row->lines,
                'level' => (int) $row->level,
                'average' => (int) round($row->average),
            ];
        }

        return view('tetris', [
            'leaderboard' => $leaderboard,
            'best' => $best,
            'stats' => $stats,
        ]);
    }
}
