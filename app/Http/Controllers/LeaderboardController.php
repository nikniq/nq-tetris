<?php

namespace App\Http\Controllers;

use App\Models\Score;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\View\View;

class LeaderboardController extends Controller
{
    public const LIMIT = 100;

    public function index(Request $request, ?string $mode = null): View
    {
        $mode = in_array($mode, Score::MODES, true) ? $mode : 'marathon';

        $rows = $this->ranked($mode);
        $me = $request->user();
        $myRank = null;
        $myRow = null;

        if ($me) {
            $position = $rows->search(fn ($row) => $row->user_id === $me->id);
            if ($position !== false) {
                $myRank = $position + 1;
                $myRow = $rows[$position];
            } else {
                // Not in the top 100: still show their best and where it sits.
                $myRow = $me->scores()->ranked($mode)->first();
                if ($myRow && ($mode !== 'sprint' || $myRow->lines >= Score::SPRINT_LINES)) {
                    $myRank = $this->rankOf($myRow, $mode);
                }
            }
        }

        $players = Score::where('mode', $mode)
            ->when($mode === 'sprint', fn ($q) => $q->where('lines', '>=', Score::SPRINT_LINES))
            ->distinct('user_id')->count('user_id');

        return view('leaderboard', [
            'mode' => $mode,
            'modes' => ['marathon' => 'Marathon', 'sprint' => 'Sprint 40', 'ultra' => 'Ultra 2:00'],
            'rows' => $rows,
            'players' => $players,
            'myRank' => $myRank,
            'myRow' => $myRow,
        ]);
    }

    /**
     * Each player's best result in the mode, best first, at most LIMIT rows.
     */
    private function ranked(string $mode): Collection
    {
        return Score::with('user:id,name,avatar')
            ->ranked($mode)
            ->limit(2000)
            ->get()
            ->unique('user_id')
            ->take(self::LIMIT)
            ->values();
    }

    /**
     * 1 + the number of other players whose best beats this result.
     */
    private function rankOf(Score $row, string $mode): int
    {
        $better = Score::where('mode', $mode)->where('user_id', '!=', $row->user_id);

        if ($mode === 'sprint') {
            $better->where('lines', '>=', Score::SPRINT_LINES)->where('duration_ms', '<', $row->duration_ms);
        } else {
            $better->where('score', '>', $row->score);
        }

        return $better->distinct('user_id')->count('user_id') + 1;
    }
}
