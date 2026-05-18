<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

class AuthController extends Controller
{
    private const DEFAULT_DEVICE_STORAGE_MB = 200;

    private const DEFAULT_DEVICE_TEMPLATES = [
        'android' => ['name' => 'Android Cloud OS', 'phone' => true, 'id_prefix' => 'android'],
        'ios' => ['name' => 'iPhone Cloud OS', 'phone' => true, 'id_prefix' => 'iphone'],
        'windows' => ['name' => 'Windows Cloud OS', 'phone' => false, 'id_prefix' => 'win-pc'],
        'macos' => ['name' => 'Mac Cloud OS', 'phone' => false, 'id_prefix' => 'mac-pc'],
    ];

    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'phone_number' => ['required', 'regex:/^\d{3,20}$/', 'unique:users,phone_number'],
            'password' => ['required', 'string', 'min:6'],
        ]);

        $password = trim((string) $validated['password']);

        $user = User::create([
            'name' => trim($validated['name']),
            'username' => strtolower(Str::slug($validated['name'])) . rand(100, 999),
            'email' => strtolower(trim($validated['email'])),
            'phone_number' => $this->normalizePhoneNumber($validated['phone_number']),
            'password' => Hash::make($password),
        ]);

        return response()->json([
            'message' => 'Account created successfully.',
            'user' => $this->mapUser($user),
        ], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'string', 'email', 'max:255'],
            'password' => ['required', 'string'],
        ]);

        $user = User::query()
            ->where('email', strtolower(trim($validated['email'])))
            ->first();

        if (! $user) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        $password = (string) $validated['password'];
        $trimmedPassword = trim($password);

        $passwordIsValid = Hash::check($password, $user->password);
        $trimmedPasswordIsValid = ! $passwordIsValid
            && $trimmedPassword !== $password
            && Hash::check($trimmedPassword, $user->password);
        $passwordWasPlainText = ! $passwordIsValid && hash_equals((string) $user->password, $password);
        $trimmedPasswordWasPlainText = ! $passwordIsValid
            && ! $passwordWasPlainText
            && $trimmedPassword !== $password
            && hash_equals((string) $user->password, $trimmedPassword);

        if (! $passwordIsValid && ! $trimmedPasswordIsValid && ! $passwordWasPlainText && ! $trimmedPasswordWasPlainText) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        if ($passwordWasPlainText || $trimmedPasswordWasPlainText || Hash::needsRehash($user->password)) {
            $user->password = Hash::make($trimmedPasswordIsValid || $trimmedPasswordWasPlainText ? $trimmedPassword : $password);
            $user->save();
        }

        return response()->json([
            'message' => 'Login successful.',
            'user' => $this->mapUser($user),
        ]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'name' => ['required', 'string', 'max:255'],
            'password' => ['nullable', 'string', 'min:6'],
        ]);

        $user = User::query()->findOrFail($validated['user_id']);
        $user->name = trim($validated['name']);

        if (! empty($validated['password'])) {
            $user->password = Hash::make(trim((string) $validated['password']));
        }

        $user->save();

        return response()->json([
            'message' => 'Account updated successfully.',
            'user' => $this->mapUser($user),
        ]);
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'string', 'email', 'max:255'],
        ]);

        $email = strtolower(trim($validated['email']));
        $user = User::query()->where('email', $email)->first();

        if (! $user) {
            return response()->json([
                'message' => 'No Cloud OS account was found for that email address.',
            ], 404);
        }

        $token = Str::random(64);

        DB::table('password_reset_tokens')->updateOrInsert(
            ['email' => $email],
            [
                'token' => Hash::make($token),
                'created_at' => now(),
            ]
        );

        $resetUrl = rtrim(config('app.url'), '/') . '/password-reset?email=' . rawurlencode($email) . '&token=' . rawurlencode($token);
        $html = view('emails.password-reset', [
            'name' => $user->name,
            'resetUrl' => $resetUrl,
        ])->render();

        try {
            Mail::html($html, function ($message) use ($email) {
                $message
                    ->from('passwordreset@cloudos.ng', 'Cloud OS Password Reset')
                    ->to($email)
                    ->subject('Reset your Cloud OS password');
            });
        } catch (Throwable) {
            return response()->json([
                'message' => 'The reset link was created, but the server could not send email. Confirm that passwordreset@cloudos.ng exists and mail sending is enabled on the live server.',
            ], 500);
        }

        return response()->json([
            'message' => 'Password reset link sent. Check your email inbox.',
        ]);
    }

    private function mapUser(User $user): array
    {
        $this->ensureDefaultDevices($user);
        $devices = DB::table('devices')
            ->where('user_id', $user->id)
            ->orderBy('created_at')
            ->get()
            ->map(fn ($row) => [
                'device_id' => $row->device_id,
                'id' => $row->device_id,
                'name' => $row->name,
                'os' => $row->os,
                'phone_number' => $row->phone_number,
                'storage' => (int) $row->storage,
                'storage_expires_at' => $row->storage_expires_at ?? null,
                'created_at' => $row->created_at,
                'updated_at' => $row->updated_at,
            ])
            ->values();

        return [
            'id' => (string) $user->id,
            'name' => $user->name,
            'username' => $user->username,
            'email' => $user->email,
            'phone_number' => $user->phone_number,
            'initials' => $user->initials,
            'avatar_url' => $user->avatar_url,
            'created_at' => optional($user->created_at)?->toISOString(),
            'devices' => $devices,
        ];
    }

    private function ensureDefaultDevices(User $user): void
    {
        $existingDevices = DB::table('devices')
            ->where('user_id', $user->id)
            ->get();
        $existingByOs = $existingDevices
            ->keyBy(fn ($device) => $this->normalizeOs((string) $device->os));
        $now = now();

        foreach (self::DEFAULT_DEVICE_TEMPLATES as $os => $template) {
            if ($existingByOs->has($os)) {
                continue;
            }

            $deviceId = $this->generateUniqueDeviceId((int) $user->id, $template['id_prefix']);
            $phoneNumber = $template['phone']
                ? $this->generateUniqueDevicePhoneNumber($user, $os)
                : null;

            DB::table('devices')->insert([
                'user_id' => $user->id,
                'device_id' => $deviceId,
                'name' => $template['name'],
                'os' => $os,
                'phone_number' => $phoneNumber,
                'storage' => self::DEFAULT_DEVICE_STORAGE_MB,
                'storage_expires_at' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    private function normalizeOs(string $os): string
    {
        $value = strtolower(trim($os));

        return match ($value) {
            'iphone', 'ios' => 'ios',
            'mac', 'macos', 'mac os', 'macosx', 'osx' => 'macos',
            'windows', 'window', 'windows os', 'win', 'pc' => 'windows',
            default => $value ?: 'android',
        };
    }

    private function generateUniqueDeviceId(int $userId, string $prefix): string
    {
        do {
            $candidate = sprintf('%s-%s-%04d', $prefix, str_pad((string) $userId, 5, '0', STR_PAD_LEFT), random_int(1000, 9999));
        } while (DB::table('devices')->where('device_id', $candidate)->exists());

        return $candidate;
    }

    private function generateUniqueDevicePhoneNumber(User $user, string $os): string
    {
        $baseDigits = $this->normalizePhoneNumber((string) $user->phone_number);
        $targetLength = max(10, min(15, strlen($baseDigits) ?: 11));
        $prefixLength = max(6, $targetLength - 4);
        $prefix = str_pad($baseDigits ?: '70000000000', $prefixLength, '0');
        $prefix = substr($prefix, 0, $prefixLength);
        $seed = abs(crc32($user->id . ':' . $os . ':' . $baseDigits));

        for ($attempt = 0; $attempt < 1000; $attempt++) {
            $suffix = str_pad((string) (($seed + $attempt) % 10000), 4, '0', STR_PAD_LEFT);
            $candidate = $prefix . $suffix;

            if (! DB::table('devices')->where('phone_number', $candidate)->exists()) {
                return $candidate;
            }
        }

        return $prefix . (string) random_int(1000, 9999);
    }

    private function normalizePhoneNumber(string $phoneNumber): string
    {
        return preg_replace('/\D+/', '', trim($phoneNumber)) ?? '';
    }
}
