import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useProfile } from "../hooks/useProfile";
import NotificationsPanel from "./NotificationsPanel";

export default function Navbar({ notificationsData }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const {
    notifications,
    notificationsLoading,
    unreadCount,
    markAsRead,
  } = useMemo(() => {
    if (!notificationsData) {
      return {
        notifications: [],
        notificationsLoading: false,
        unreadCount: 0,
        markAsRead: () => { },
      };
    }

    return {
      notifications: notificationsData.notifications ?? [],
      notificationsLoading: notificationsData.loading ?? false,
      unreadCount: notificationsData.unreadCount ?? 0,
      markAsRead: notificationsData.markAsRead ?? (() => { }),
    };
  }, [notificationsData]);


  const isActive = (path) => {
    if (path === '/profile') {
      return location.pathname === '/profile' || location.pathname.startsWith('/profile/');
    }
    return location.pathname === path;
  };

  const handleNavClick = (path) => {
    navigate(path);
    setIsMobileMenuOpen(false);
    setShowNotifications(false);
  };

  const toggleNotifications = () => {
    setShowNotifications((prev) => !prev);
  };

  const unreadIds = useMemo(
    () => (notifications || []).filter((notif) => !notif.read_at).map((notif) => notif.id),
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

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <h1 className="navbar-logo">plop</h1>
        <button
          className="mobile-menu-toggle"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Toggle menu"
        >
          <span className={`hamburger ${isMobileMenuOpen ? 'active' : ''}`}>
            <span></span>
            <span></span>
            <span></span>
          </span>
        </button>
      </div>
      <div className={`navbar-links ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
        <button
          className={`nav-link ${isActive('/home') || location.pathname === '/' ? "active" : ""}`}
          onClick={() => handleNavClick('/home')}
        >
          Home
        </button>
        <button
          className={`nav-link ${isActive('/friends') ? "active" : ""}`}
          onClick={() => handleNavClick('/friends')}
        >
          Friends
        </button>
        <button
          className={`nav-link ${isActive('/blog') ? "active" : ""}`}
          onClick={() => handleNavClick('/blog')}
        >
          Blog
        </button>
        <button
          className={`nav-link ${isActive('/games') ? "active" : ""}`}
          onClick={() => handleNavClick('/games')}
        >
          Games
        </button>
        <button
          className={`nav-link ${isActive('/messages') ? "active" : ""}`}
          onClick={() => handleNavClick('/messages')}
        >
          Messages
        </button>
        <button
          className={`nav-link profile-nav-link ${isActive('/profile') ? "active" : ""}`}
          onClick={() => handleNavClick('/profile')}
        >
          Profile
        </button>
      </div>
      <div className="navbar-user">
        {user && notificationsData && (
          <div className="notifications-container">
            <button
              type="button"
              className={`notifications-toggle ${showNotifications ? "open" : ""}`}
              onClick={toggleNotifications}
              aria-label="Notifications"
            >
              <span className="notifications-icon">🔔</span>
              {unreadCount > 0 && <span className="notifications-badge">{unreadCount}</span>}
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
        )}
        <button
          className={`profile-nav-btn ${isActive('/profile') ? "active" : ""}`}
          onClick={() => {
            handleNavClick('/profile');
          }}
        >
          <div className="profile-nav-avatar">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.nickname} />
            ) : (
              <div className="profile-nav-avatar-placeholder">
                {profile?.nickname?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
          </div>
          <span className="profile-nav-name">
            {profile?.nickname || user?.email?.split('@')[0] || 'User'}
          </span>
        </button>
      </div>
    </nav>
  );
}

