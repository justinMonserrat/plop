import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabaseClient";
import { useProfile } from "../hooks/useProfile";

export default function Navbar({ currentPage, onPageChange }) {
  const { user } = useAuth();
  const { profile } = useProfile();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <h1 className="navbar-logo">plop</h1>
      </div>
      <div className="navbar-links">
        <button
          className={`nav-link ${currentPage === "home" ? "active" : ""}`}
          onClick={() => onPageChange("home")}
        >
          Home
        </button>
        <button
          className={`nav-link ${currentPage === "friends" ? "active" : ""}`}
          onClick={() => onPageChange("friends")}
        >
          Friends
        </button>
        <button
          className={`nav-link ${currentPage === "blog" ? "active" : ""}`}
          onClick={() => onPageChange("blog")}
        >
          Blog
        </button>
        <button
          className={`nav-link ${currentPage === "messages" ? "active" : ""}`}
          onClick={() => onPageChange("messages")}
        >
          Messages
        </button>
      </div>
      <div className="navbar-user">
        <button
          className={`profile-nav-btn ${currentPage === "profile" ? "active" : ""}`}
          onClick={() => {
            onPageChange("profile");
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
        <button className="logout-btn" onClick={handleLogout}>
          Log Out
        </button>
      </div>
    </nav>
  );
}

