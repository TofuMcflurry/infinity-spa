<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Events\Audit\PasswordResetCompleted;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Auth\Passwords\DatabaseTokenRepository;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class NewPasswordController extends Controller
{
    /**
     * Display the password reset view.
     */
    public function create(Request $request): Response
    {
        return Inertia::render('Auth/ResetPassword', [
            'email' => $request->email,
            'token' => $request->route('token'),
        ]);
    }

    /**
     * Handle an incoming new password request.
     *
     * @throws \Illuminate\Validation\ValidationException
     */
    public function store(Request $request): RedirectResponse
    {
        app(\App\Services\AuthenticationFlowService::class)->clear($request);
        $request->validate([
            'token' => 'required',
            'email' => 'required|email',
            'password' => ['required', 'confirmed', Rules\Password::defaults()],
        ]);

        // Here we will attempt to reset the user's password. If it is successful we
        // will update the password on an actual user model and persist it to the
        // database. Otherwise we will parse the error and return the response.
        $broker = Password::broker();
        $repository = $broker->getRepository();
        $connection = DB::connection();
        // The current broker uses the same database as User and AuditLog.
        // Refuse non-transactional/separate token storage rather than partially
        // committing credentials while losing token or audit consistency.
        if (!$repository instanceof DatabaseTokenRepository || $repository->getConnection() !== $connection) {
            throw new \RuntimeException('Password reset requires shared transactional storage.');
        }
        $status = $connection->transaction(fn () => $broker->reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function ($user, $password) use ($request, $broker, $connection) {
                if ($user->getConnection() !== $connection) {
                    throw new \RuntimeException('Password reset requires shared transactional storage.');
                }
                $locked = $user->newQuery()->whereKey($user->getKey())->lockForUpdate()->firstOrFail();
                // The broker validated before this lock. Recheck after waiting
                // so a concurrently consumed/expired token cannot reset twice.
                if (!$broker->tokenExists($locked, $request->input('token'))) {
                    throw ValidationException::withMessages(['email' => trans(Password::INVALID_TOKEN)]);
                }
                $locked->forceFill([
                    'password' => Hash::make($password),
                    'remember_token' => Str::random(60),
                ]);
                if (!$locked->save()) {
                    throw new \RuntimeException('Password reset could not be saved.');
                }

                PasswordResetCompleted::dispatch($locked->id, $request);
                // The broker deletes its token after this callback. Announce
                // the framework success event only when that also commits.
                $connection->afterCommit(fn () => event(new PasswordReset($locked)));
            }
        ));

        // If the password was successfully reset, we will redirect the user back to
        // the application's home authenticated view. If there is an error we can
        // redirect them back to where they came from with their error message.
        if ($status == Password::PASSWORD_RESET) {
            return redirect()->route('login')->with('status', __($status));
        }

        throw ValidationException::withMessages([
            'email' => [trans($status)],
        ]);
    }
}
