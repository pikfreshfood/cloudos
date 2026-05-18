<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Contact;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ContactController extends Controller
{
    private const DEFAULT_DEVICE_STORAGE_MB = 200;

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'device_id' => ['nullable', 'string'],
        ]);

        $query = Contact::query()
            ->with('contactUser:id,name,phone_number')
            ->where('user_id', $validated['user_id']);

        if ($this->hasContactDeviceIdColumn() && ! empty($validated['device_id'])) {
            $query->where('device_id', $validated['device_id']);
        }

        $contacts = $query
            ->orderBy('name')
            ->get()
            ->map(fn (Contact $contact) => $this->mapContact($contact))
            ->values();

        return response()->json(['contacts' => $contacts]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'device_id' => ['nullable', 'string'],
            'name' => ['required', 'string', 'max:255'],
            'phone_number' => ['required', 'string', 'max:50'],
        ]);

        $validated['phone_number'] = preg_replace('/\D+/', '', trim($validated['phone_number'])) ?? '';

        if ($validated['phone_number'] === '') {
            return response()->json([
                'message' => 'Phone number is required.',
                'errors' => [
                    'phone_number' => ['Phone number is required.'],
                ],
            ], 422);
        }

        $linkedDevice = $this->findDeviceByPhoneNumber($validated['phone_number']);
        $linkedUser = $linkedDevice
            ? User::find($linkedDevice->user_id)
            : User::query()
            ->where('phone_number', $validated['phone_number'])
            ->first();

        $updateOrCreate = [
            'user_id' => $validated['user_id'],
            'phone_number' => $validated['phone_number'],
        ];

        $hasDeviceIdColumn = $this->hasContactDeviceIdColumn();

        if ($hasDeviceIdColumn && empty($validated['device_id'])) {
            return response()->json([
                'message' => 'Device id is required so synced contacts stay assigned to the device OS that synced them.',
                'errors' => [
                    'device_id' => ['Device id is required.'],
                ],
            ], 422);
        }

        if ($hasDeviceIdColumn && ! empty($validated['device_id'])) {
            $updateOrCreate['device_id'] = $validated['device_id'];
        }

        $contact = Contact::query()->updateOrCreate(
            $updateOrCreate,
            [
                'name' => trim($validated['name']),
                'contact_user_id' => $linkedUser?->id,
                ...($hasDeviceIdColumn && ! empty($validated['device_id']) ? ['device_id' => $validated['device_id']] : []),
            ]
        );

        $contact->load('contactUser:id,name,phone_number');

        return response()->json([
            'message' => 'Contact saved successfully.',
            'contact' => $this->mapContact($contact),
        ], 201);
    }

    public function destroy(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'device_id' => ['nullable', 'string'],
            'contact_id' => ['required', 'integer', 'exists:contacts,id'],
        ]);

        $userId = $validated['user_id'];
        $contactId = $validated['contact_id'];

        $query = Contact::query()
            ->where('user_id', $userId);

        if ($this->hasContactDeviceIdColumn() && ! empty($validated['device_id'])) {
            $query->where('device_id', $validated['device_id']);
        }

        $contact = $query->findOrFail($contactId);

        $contact->delete();

        return response()->json([
            'message' => 'Contact deleted successfully.',
        ]);
    }

    public function bulkDestroy(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'device_id' => ['nullable', 'string'],
            'contact_ids' => ['required', 'array', 'min:1'],
            'contact_ids.*' => ['integer', 'exists:contacts,id'],
        ]);

        $query = Contact::query()
            ->where('user_id', $validated['user_id']);

        if ($this->hasContactDeviceIdColumn() && ! empty($validated['device_id'])) {
            $query->where('device_id', $validated['device_id']);
        }

        $deletedCount = $query
            ->whereIn('id', $validated['contact_ids'])
            ->delete();

        return response()->json([
            'message' => 'Contacts deleted successfully.',
            'deleted_count' => $deletedCount,
        ]);
    }

    public function lookup(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'phone_number' => ['required', 'string', 'max:50'],
        ]);

        $validated['phone_number'] = preg_replace('/\D+/', '', trim($validated['phone_number'])) ?? '';

        if ($validated['phone_number'] === '') {
            return response()->json([
                'message' => 'Phone number is required.',
                'errors' => [
                    'phone_number' => ['Phone number is required.'],
                ],
            ], 422);
        }

        $linkedDevice = $this->findDeviceByPhoneNumber($validated['phone_number']);
        $user = $linkedDevice
            ? User::find($linkedDevice->user_id)
            : User::query()
            ->where('phone_number', $validated['phone_number'])
            ->first();

        return response()->json([
            'user' => $user ? [
                'id' => (string) $user->id,
                'name' => $user->name,
                'phone_number' => $user->phone_number,
            ] : null,
            'device' => $linkedDevice ? $this->mapDevice($linkedDevice) : null,
        ]);
    }

    private function mapContact(Contact $contact): array
    {
        $linkedDevice = $this->findDeviceByPhoneNumber($contact->phone_number);
        $syncDevice = $this->findDeviceByDeviceId((string) ($contact->device_id ?? ''));

        return [
            'id' => (string) $contact->id,
            'name' => $contact->name,
            'phone_number' => $contact->phone_number,
            'device_id' => $contact->device_id,
            'device_os' => $syncDevice?->os,
            'sync_device' => $syncDevice ? $this->mapDevice($syncDevice) : null,
            'linked_user' => $contact->contactUser ? [
                'id' => (string) $contact->contactUser->id,
                'name' => $contact->contactUser->name,
                'phone_number' => $contact->contactUser->phone_number,
            ] : null,
            'linked_device' => $linkedDevice ? $this->mapDevice($linkedDevice) : null,
        ];
    }

    private function findDeviceByPhoneNumber(string $phoneNumber): ?object
    {
        if (! Schema::hasTable('devices')) {
            return null;
        }

        $digits = preg_replace('/\D+/', '', $phoneNumber) ?? '';

        if ($digits === '') {
            return null;
        }

        return DB::table('devices')
            ->where('phone_number', $phoneNumber)
            ->orWhere('phone_number', $digits)
            ->first();
    }

    private function findDeviceByDeviceId(string $deviceId): ?object
    {
        if ($deviceId === '' || ! Schema::hasTable('devices')) {
            return null;
        }

        return DB::table('devices')
            ->where('device_id', $deviceId)
            ->first();
    }

    private function hasContactDeviceIdColumn(): bool
    {
        return Schema::hasColumn('contacts', 'device_id');
    }

    private function mapDevice(object $device): array
    {
        return [
            'user_id' => (string) $device->user_id,
            'device_id' => $device->device_id,
            'name' => $device->name,
            'os' => $device->os,
            'phone_number' => $device->phone_number,
            'storage' => (int) ($device->storage ?? self::DEFAULT_DEVICE_STORAGE_MB),
            'storage_expires_at' => $device->storage_expires_at ?? null,
        ];
    }
}
