<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppStoreReview;
use App\Models\DeveloperApp;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class AppStoreController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->query('search', ''));

        $apps = DeveloperApp::query()
            ->with('developer')
            ->withAvg('reviews', 'rating')
            ->withCount('reviews')
            ->where('status', 'approved')
            ->when($search !== '', function ($query) use ($search) {
                $query->where(function ($nested) use ($search) {
                    $nested->where('app_name', 'like', "%{$search}%")
                        ->orWhere('app_description', 'like', "%{$search}%")
                        ->orWhere('app_url', 'like', "%{$search}%")
                        ->orWhereHas('developer', function ($developerQuery) use ($search) {
                            $developerQuery->where('developer_name', 'like', "%{$search}%")
                                ->orWhere('company_name', 'like', "%{$search}%");
                        });
                });
            })
            ->orderByDesc('reviews_avg_rating')
            ->orderByDesc('reviews_count')
            ->orderByDesc('approved_at')
            ->orderByDesc('updated_at')
            ->get()
            ->map(fn (DeveloperApp $app) => $this->serializeApp($app, $request))
            ->values();

        return response()->json([
            'apps' => $apps,
        ]);
    }

    public function reviews(Request $request, DeveloperApp $app): JsonResponse
    {
        abort_unless($app->status === 'approved', 404);

        return response()->json([
            'reviews' => $app->reviews()
                ->with('user:id,name,email,username')
                ->latest()
                ->limit(50)
                ->get()
                ->map(fn (AppStoreReview $review) => $this->serializeReview($review))
                ->values(),
            'summary' => [
                'average_rating' => round((float) $app->reviews()->avg('rating'), 1),
                'ratings_count' => $app->reviews()->count(),
            ],
        ]);
    }

    public function storeReview(Request $request, DeveloperApp $app): JsonResponse
    {
        abort_unless($app->status === 'approved', 404);

        $validated = $request->validate([
            'user_id' => ['required', 'string', 'max:255'],
            'device_id' => ['nullable', 'string', 'max:255'],
            'rating' => ['required', 'integer', 'min:1', 'max:5'],
            'comment' => ['nullable', 'string', 'max:1000'],
        ]);

        $review = AppStoreReview::updateOrCreate(
            [
                'developer_app_id' => $app->id,
                'user_id' => $validated['user_id'],
                'device_id' => $validated['device_id'] ?? null,
            ],
            [
                'rating' => (int) $validated['rating'],
                'comment' => trim($validated['comment'] ?? ''),
            ]
        );

        $app->loadAvg('reviews', 'rating')->loadCount('reviews');

        return response()->json([
            'review' => $this->serializeReview($review),
            'summary' => [
                'average_rating' => round((float) $app->reviews_avg_rating, 1),
                'ratings_count' => $app->reviews_count,
            ],
        ]);
    }

    private function serializeApp(DeveloperApp $app, Request $request): array
    {
        $iconUrl = $app->app_icon_path
            ? route('developer-app-media', ['path' => $app->app_icon_path])
            : null;

        $iconSize = (int) $app->app_icon_size_bytes;
        if (! $iconSize && $app->app_icon_path && Storage::disk('public')->exists($app->app_icon_path)) {
            $iconSize = Storage::disk('public')->size($app->app_icon_path);
        }

        $screenshots = collect($app->screenshots ?? [])
            ->map(function ($screenshot) use ($request) {
                $path = is_array($screenshot) ? ($screenshot['path'] ?? '') : (string) $screenshot;
                if (! $path) {
                    return null;
                }

                return [
                    'url' => route('developer-app-media', ['path' => $path]),
                    'size_bytes' => is_array($screenshot) ? (int) ($screenshot['size_bytes'] ?? 0) : 0,
                ];
            })
            ->filter()
            ->values();

        return [
            'id' => $app->id,
            'name' => $app->app_name,
            'description' => $app->app_description,
            'app_url' => $app->app_url,
            'icon_url' => $iconUrl,
            'icon_size_bytes' => $iconSize,
            'screenshots' => $screenshots,
            'environment' => $app->environment,
            'developer_name' => $app->developer?->developer_name,
            'average_rating' => round((float) ($app->reviews_avg_rating ?? 0), 1),
            'ratings_count' => (int) ($app->reviews_count ?? 0),
            'approved_at' => optional($app->approved_at)->toISOString(),
            'updated_at' => optional($app->updated_at)->toISOString(),
        ];
    }

    private function serializeReview(AppStoreReview $review): array
    {
        return [
            'id' => $review->id,
            'user_id' => $review->user_id,
            'user_name' => $review->user?->name,
            'user_email' => $review->user?->email,
            'username' => $review->user?->username,
            'device_id' => $review->device_id,
            'rating' => (int) $review->rating,
            'comment' => $review->comment,
            'created_at' => optional($review->created_at)->toISOString(),
            'updated_at' => optional($review->updated_at)->toISOString(),
        ];
    }
}
