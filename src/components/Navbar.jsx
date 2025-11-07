import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useProfile } from "../hooks/useProfile";

export default function Navbar() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isActive = (path) => {
    if (path === '/profile') {
      return location.pathname === '/profile' || location.pathname.startsWith('/profile/');
    }
    return location.pathname === path;
  };

  const handleNavClick = (path) => {
    navigate(path);
    setIsMobileMenuOpen(false);
  };

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

