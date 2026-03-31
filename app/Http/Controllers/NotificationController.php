<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class NotificationController extends Controller
{
    // ── Get all notifications ─────────────────────────────────────────────────
    public function index()
    {
        $notifications = auth()->user()
            ->notifications()
            ->latest()
            ->take(20)
            ->get()
            ->map(fn($n) => [
                'id'         => $n->id,
                'type'       => $n->data['type']       ?? '',
                'title'      => $n->data['title']      ?? '',
                'message'    => $n->data['message']    ?? '',
                'icon'       => $n->data['icon']       ?? 'bell',
                'color'      => $n->data['color']      ?? 'gray',
                'booking_id' => $n->data['booking_id'] ?? null,
                'booking_ref'=> $n->data['booking_ref'] ?? null,
                'url'        => $n->data['url']        ?? '/my-bookings',
                'read'       => !is_null($n->read_at),
                'created_at' => $n->created_at->diffForHumans(),
            ]);

        return response()->json([
            'notifications'  => $notifications,
            'unread_count'   => auth()->user()->unreadNotifications()->count(),
        ]);
    }

    // ── Mark single notification as read ─────────────────────────────────────
    public function markRead(string $id)
    {
        $notification = auth()->user()
            ->notifications()
            ->findOrFail($id);

        $notification->markAsRead();

        return response()->json(['message' => 'Marked as read.']);
    }

    // ── Mark all as read ──────────────────────────────────────────────────────
    public function markAllRead()
    {
        auth()->user()->unreadNotifications->markAsRead();

        return response()->json(['message' => 'All marked as read.']);
    }

    // ── Get unread count only (for bell badge) ────────────────────────────────
    public function unreadCount()
    {
        return response()->json([
            'unread_count' => auth()->user()->unreadNotifications()->count(),
        ]);
    }
}