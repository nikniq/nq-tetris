<?php

use App\Http\Controllers\AccountController;
use App\Http\Controllers\Auth\AccountLinkController;
use App\Http\Controllers\Auth\GoogleController;
use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\PasswordController;
use App\Http\Controllers\Auth\RegisterController;
use App\Http\Controllers\GameController;
use App\Http\Controllers\ScoreController;
use Illuminate\Support\Facades\Route;

Route::get('/', [GameController::class, 'index'])->name('tetris');

Route::middleware('guest')->group(function () {
    Route::get('/register', [RegisterController::class, 'create'])->name('register');
    Route::post('/register', [RegisterController::class, 'store'])->middleware('throttle:6,1');
    Route::get('/register/sent', [RegisterController::class, 'sent'])->name('register.sent');

    Route::get('/login', [LoginController::class, 'create'])->name('login');
    Route::post('/login', [LoginController::class, 'store'])->middleware('throttle:10,1');

    Route::get('/forgot', [AccountLinkController::class, 'forgotForm'])->name('password.forgot');
    Route::post('/forgot', [AccountLinkController::class, 'forgot'])->middleware('throttle:6,1');
});

// The link from the email. Works whether or not someone is signed in, so a
// user who opens it in a browser with an old session still gets through.
Route::get('/account/link/{user}/{hash}', [AccountLinkController::class, 'consume'])
    ->middleware('signed')
    ->name('account.link');

Route::get('/auth/google', [GoogleController::class, 'redirect'])->name('google.redirect');
Route::get('/auth/google/callback', [GoogleController::class, 'callback'])->name('google.callback');

Route::middleware('auth')->group(function () {
    Route::get('/password/set', [PasswordController::class, 'create'])->name('password.set');
    Route::post('/password/set', [PasswordController::class, 'store']);

    Route::get('/account', [AccountController::class, 'show'])->name('account');
    Route::post('/account/name', [AccountController::class, 'updateName'])->name('account.name');
    Route::post('/account/password', [AccountController::class, 'updatePassword'])->name('account.password');
    Route::post('/account/google/unlink', [AccountController::class, 'unlinkGoogle'])->name('account.google.unlink');
    Route::delete('/account', [AccountController::class, 'destroy'])->name('account.destroy');

    Route::post('/logout', [LoginController::class, 'destroy'])->name('logout');
    Route::post('/scores', [ScoreController::class, 'store'])->name('scores.store');
});
