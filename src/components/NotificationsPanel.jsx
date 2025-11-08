import { useMemo } from "react";
import { formatDistanceToNow } from "../utils/time";

const typeLabels = {
    post_like: "liked your post",
    post_comment: "commented on your post",
    comment_reply: "replied to your comment",
    follow: "started following you",
};

export default function NotificationsPanel({
    notifications,
    loading,
    unreadCount,
    onMarkAllRead,
    onNavigate,
}) {
    const displayNotifications = useMemo(() => notifications ?? [], [notifications]);

    return (
        <div className="notifications-panel">
            <div className="notifications-header">
                <div>
                    <h3>Notifications</h3>
                    <span className="notifications-subtitle">
                        {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
                    </span>
                </div>
                <button
                    type="button"
                    className="notifications-mark-read"
                    onClick={onMarkAllRead}
                    disabled={unreadCount === 0}
                >
                    Mark all read
                </button>
            </div>
            <div className="notifications-content">
                {loading ? (
                    <p className="notifications-empty">Loading…</p>
                ) : displayNotifications.length === 0 ? (
                    <p className="notifications-empty">No notifications yet. Interact with the community!</p>
                ) : (
                    <ul className="notifications-list">
                        {displayNotifications.map((notification) => {
                            const actorName =
                                notification.payload?.actorName ||
                                notification.payload?.actorNickname ||
                                notification.payload?.actorEmail ||
                                "Someone";
                            const actionLabel =
                                typeLabels[notification.type] || notification.payload?.message || "did something";
                            const createdAtLabel = notification.created_at
                                ? formatDistanceToNow(notification.created_at)
                                : "";

                            const unread = !notification.read_at;

                            return (
                                <li
                                    key={notification.id}
                                    className={`notifications-item ${unread ? "unread" : ""}`}
                                    onClick={() => onNavigate?.(notification)}
                                    role="button"
                                >
                                    <div className="notifications-item-content">
                                        <p className="notifications-item-text">
                                            <span className="actor-name">{actorName}</span> {actionLabel}
                                        </p>
                                        {notification.payload?.snippet && (
                                            <p className="notifications-item-snippet">{notification.payload.snippet}</p>
                                        )}
                                    </div>
                                    <span className="notifications-item-time">{createdAtLabel}</span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}

