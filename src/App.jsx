import { useState, useEffect } from "react";
import { useAuth } from "./context/AuthContext";
import { supabase } from "./supabaseClient";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Home from "./pages/Home";
import Profile from "./pages/Profile";
import Friends from "./pages/Friends";
import Blog from "./pages/Blog";
import Messages from "./pages/Messages";
import Navbar from "./components/Navbar";
import "./styles/navbar.css";

export default function App() {
  const { user } = useAuth();
  const [currentPage, setCurrentPage] = useState("home");
  const [viewingUserId, setViewingUserId] = useState(null);
  const [showResetPassword, setShowResetPassword] = useState(false);

  useEffect(() => {
    // Check if we're on a password reset page (check URL hash)
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.substring(1));
    const type = params.get('type');
    
    if (type === 'recovery' || hash.includes('type=recovery')) {
      setShowResetPassword(true);
    }

    // Listen for auth state changes to detect password recovery
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setShowResetPassword(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (!user) {
    if (showResetPassword) {
      return <ResetPassword />;
    }
    return <Auth />;
  }

  const handleViewProfile = (userId) => {
    setViewingUserId(userId);
    setCurrentPage("profile");
  };

  const handleBackToOwnProfile = () => {
    setViewingUserId(null);
    // Keep profile page active, just switch to own profile
  };

  // Reset viewingUserId when navigating away from profile
  useEffect(() => {
    if (currentPage !== "profile") {
      setViewingUserId(null);
    }
  }, [currentPage]);

  const renderPage = () => {
    switch (currentPage) {
      case "home":
        return <Home onViewProfile={handleViewProfile} />;
      case "profile":
        return (
          <Profile 
            userId={viewingUserId} 
            onViewProfile={handleViewProfile}
            onBackToOwnProfile={handleBackToOwnProfile}
          />
        );
      case "friends":
        return <Friends onViewProfile={handleViewProfile} />;
      case "blog":
        return <Blog onViewProfile={handleViewProfile} />;
      case "messages":
        return <Messages onViewProfile={handleViewProfile} />;
      default:
        return <Home />;
    }
  };

  return (
    <div className="app-container">
      <Navbar 
        currentPage={currentPage} 
        onPageChange={(page) => {
          setCurrentPage(page);
          if (page !== "profile") {
            setViewingUserId(null);
          }
        }} 
      />
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  );
}
