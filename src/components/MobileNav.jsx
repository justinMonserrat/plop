import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import NotificationsPanel from "./NotificationsPanel";

const NAV_ITEMS = [
    { path: "/home", label: "Home", icon: "🏠" },
    { path: "/friends", label: "Friends", icon: "🧑‍🤝‍🧑" },
    { path: "/blog", label: "Blog", icon: "📝" },
    { path: "/games", label: "Games", icon: "🎮" },
    { path: "/messages", label: "Messages", icon: "💬" },
    { path: "/profile", label: "Profile", icon: "👤" },
];

export default function MobileNav({ notificationsData }) {
    const { user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [showNotifications, setShowNotifications] = useState(false);

    const {
        notifications,
        unreadCount,
        notificationsLoading,
        markAsRead,
    } = useMemo(() => {
        if (!notificationsData) {
            return {
                notifications: [],
                unreadCount: 0,
                notificationsLoading: false,
                markAsRead: () => { },
            };
        }

        return {
            notifications: notificationsData.notifications ?? [],
            unreadCount: notificationsData.unreadCount ?? 0,
            notificationsLoading: notificationsData.loading ?? false,
            markAsRead: notificationsData.markAsRead ?? (() => { }),
        };
    }, [notificationsData]);

    const unreadIds = useMemo(
        () => notifications.filter((notif) => !notif.read_at).map((notif) => notif.id),
        [notifications]
    );

    useEffect(() => {
        if (showNotifications && unreadIds.length > 0) {
            markAsRead(unreadIds);
        }
    }, [showNotifications, unreadIds, markAsRead]);

    useEffect(() => {
        setShowNotifications(false);
    }, [location.pathname]);

    if (!user) return null;

    return (
        <nav className="mobile-nav">
            {NAV_ITEMS.map((item) => (
                <button
                    key={item.path}
                    type="button"
                    className={`mobile-nav-item ${location.pathname.startsWith(item.path) ? "active" : ""}`}
                    onClick={() => navigate(item.path)}
                >
                    <span className="mobile-nav-icon" aria-hidden="true">
                        {item.icon}
                    </span>
                    <span className="mobile-nav-label">{item.label}</span>
                </button>
            ))}
            <div className="mobile-nav-notifications">
                <button
                    type="button"
                    className={`mobile-nav-item notifications ${showNotifications ? "active" : ""}`}
                    onClick={() => setShowNotifications((prev) => !prev)}
                >
                    <span className="mobile-nav-icon" aria-hidden="true">
                        🔔
                    </span>
                    <span className="mobile-nav-label">Alerts</span>
                    {unreadCount > 0 && <span className="mobile-nav-badge">{unreadCount}</span>}
                </button>
                {showNotifications && (
                    <NotificationsPanel
                        notifications={notifications}
                        loading={notificationsLoading}
                        unreadCount={unreadCount}
                        onMarkAllRead={() => markAsRead(unreadIds)}
                        onNavigate={(notification) => {
                            const postId = notification.post_id || notification.payload?.postId;
                            if (postId) {
                                navigate(`/home?post=${postId}`);
                            }
                            setShowNotifications(false);
                        }}
                    />
                )}
            </div>
        </nav>
    );
}

