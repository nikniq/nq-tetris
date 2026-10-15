<?php

namespace App\Http\Controllers;

use App\Models\Score;
use Illuminate\Http\Request;
use Illuminate\View\View;

class GameController extends Controller
{
    public function index(Request $request): View
    {
        $leaderboards = [];
        foreach (Score::MODES as $mode) {
            $leaderboards[$mode] = Score::with('user:id,name')
                ->ranked($mode)
                ->limit(10)
                ->get();
        }

        $bests = array_fill_keys(Score::MODES, null);
        $stats = null;

        if ($user = $request->user()) {
            foreach (Score::MODES as $mode) {
                $bests[$mode] = $user->scores()->ranked($mode)->first();
            }
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
            'leaderboards' => $leaderboards,
            'bests' => $bests,
            'stats' => $stats,
        ]);
    }
}
