import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import "../styles/auth.css";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check URL hash for reset password token
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');

    // Listen for auth state changes first
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setLoading(false);
        setError("");
      } else if (event === 'SIGNED_OUT' || (!session && event !== 'INITIAL_SESSION')) {
        if (!hash || !type) {
          setError("Invalid or expired reset link. Please request a new password reset.");
          setLoading(false);
        }
      }
    });

    const initializeSession = async () => {
      if (type === 'recovery' && accessToken) {
        // Exchange the token for a session
        const { data: { session }, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken || '',
        });
        
        if (error) {
          console.error('Session error:', error);
          setError("Invalid or expired reset link. Please request a new password reset.");
          setLoading(false);
        } else if (session) {
          // Session established, user can reset password
          setLoading(false);
          setError("");
        } else {
          setError("Invalid or expired reset link. Please request a new password reset.");
          setLoading(false);
        }
      } else {
        // Check if we have a valid session (might already be set from previous visit)
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session) {
          setError("Invalid or expired reset link. Please request a new password reset.");
        }
        setLoading(false);
      }
    };

    initializeSession();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (password !== confirmPassword) {
      setError("Passwords do not match!");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long!");
      return;
    }

    // First, ensure we have a valid session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (!session || sessionError) {
      setError("Your session has expired. Please request a new password reset link.");
      return;
    }

    // Update the password
    const { error } = await supabase.auth.updateUser({
      password: password,
    });

    if (error) {
      setError(error.message);
    } else {
      setSuccess("Password updated successfully! Redirecting...");
      // Clear the URL hash
      window.history.replaceState(null, '', window.location.pathname);
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    }
  };

  if (loading) {
    return (
      <div className="auth-container">
        <p style={{ color: "white", fontFamily: "Arial, sans-serif" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-header">
        <h1 className="auth-logo">plop</h1>
        <p className="auth-tagline">Reset Your Password</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="password-input-wrapper">
          <input 
            type={showPassword ? "text" : "password"} 
            placeholder="New Password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)} 
            required
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? "🙈" : "👁️"}
          </button>
        </div>
        <div className="password-input-wrapper">
          <input 
            type={showConfirmPassword ? "text" : "password"} 
            placeholder="Confirm New Password" 
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)} 
            required
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            aria-label={showConfirmPassword ? "Hide password" : "Show password"}
          >
            {showConfirmPassword ? "🙈" : "👁️"}
          </button>
        </div>
        <button type="submit">Update Password</button>
      </form>
      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}
    </div>
  );
}

