import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { supabase } from "./supabaseClient";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Home from "./pages/Home";
import Profile from "./pages/Profile";
import Friends from "./pages/Friends";
import Blog from "./pages/Blog";
import Messages from "./pages/Messages";
import Games from "./pages/Games";
import Navbar from "./components/Navbar";
import MobileNav from "./components/MobileNav";
import "./styles/navbar.css";
import "./styles/mobile-nav.css";
import { useNotifications } from "./hooks/useNotifications";

function AppRoutes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showResetPassword, setShowResetPassword] = useState(false);
  const notificationsData = useNotifications(user?.id);

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
    if (userId === user.id) {
      navigate('/profile');
    } else {
      navigate(`/profile/${userId}`);
    }
  };

  return (
    <div className="app-container">
      <Navbar notificationsData={notificationsData} />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home onViewProfile={handleViewProfile} />} />
          <Route path="/home" element={<Home onViewProfile={handleViewProfile} />} />
          <Route path="/profile" element={<Profile onViewProfile={handleViewProfile} />} />
          <Route path="/profile/:userId" element={<ProfileWithUserId onViewProfile={handleViewProfile} />} />
          <Route path="/friends" element={<Friends onViewProfile={handleViewProfile} />} />
          <Route path="/blog" element={<Blog onViewProfile={handleViewProfile} />} />
          <Route path="/messages" element={<Messages onViewProfile={handleViewProfile} />} />
          <Route path="/games" element={<Games onViewProfile={handleViewProfile} />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </main>
      <MobileNav notificationsData={notificationsData} />
    </div>
  );
}

function ProfileWithUserId({ onViewProfile }) {
  const { userId } = useParams();
  return <Profile userId={userId} onViewProfile={onViewProfile} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
