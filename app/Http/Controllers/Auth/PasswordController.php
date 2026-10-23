<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Events\Audit\PasswordChanged;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class PasswordController extends Controller
{
    /**
     * Update the user's password.
     */
    public function update(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'current_password' => ['required', 'current_password'],
            'password' => ['required', Password::defaults(), 'confirmed'],
        ]);

        DB::transaction(function () use ($request, $validated) {
            $user = $request->user()->newQuery()->whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            // Recheck after locking: another credential mutation may have won
            // the race after the request's current_password validation.
            if (!Hash::check($validated['current_password'], $user->password)) {
                throw ValidationException::withMessages(['current_password' => __('validation.current_password')]);
            }
            $user->password = Hash::make($validated['password']);
            if (!$user->save()) {
                throw new \RuntimeException('Password change could not be saved.');
            }
            PasswordChanged::dispatch($user->id, $request);
        });

        return back();
    }

    public function setPasswordForGoogleUser(Request $request)
    {
        // The legacy guest form provides no proof of account ownership.
        // Keep direct setup disabled; do not revive the email-selected write.
        abort(403, 'Direct password setup is unavailable. Use the password reset flow.');
    }
}
