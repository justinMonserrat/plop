import { useState } from "react";
import { supabase } from "../supabaseClient";
import "../styles/auth.css";

export default function Login({ onSwitchToSignup }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else window.location.reload();
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Please enter your email address first");
      return;
    }
    setIsResetting(true);
    setError("");
    setResetMessage("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      setError(error.message);
      setIsResetting(false);
    } else {
      setResetMessage("Password reset email sent! Check your inbox.");
      setIsResetting(false);
    }
  };

  return (
    <div className="auth-container">
      <h2>Log In</h2>
      <form onSubmit={handleLogin}>
        <input 
          type="email" 
          placeholder="Email" 
          value={email}
          onChange={(e) => setEmail(e.target.value)} 
          required
        />
        <div className="password-input-wrapper">
          <input 
            type={showPassword ? "text" : "password"} 
            placeholder="Password" 
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
        <button type="submit">Log In</button>
        <button 
          type="button"
          onClick={handleForgotPassword}
          disabled={isResetting}
          className="forgot-password-btn"
        >
          {isResetting ? "Sending..." : "Forgot Password?"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {resetMessage && <p className="success">{resetMessage}</p>}
      <p style={{ color: 'white', marginTop: '1rem', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
        Don't have an account?{" "}
        <button 
          type="button"
          onClick={onSwitchToSignup}
          style={{ 
            background: 'none', 
            border: 'none', 
            color: '#87CEEB', 
            textDecoration: 'underline', 
            cursor: 'pointer',
            fontFamily: 'Arial, sans-serif',
            fontSize: '1rem',
            fontWeight: 'bold',
            padding: 0
          }}
        >
          Sign up
        </button>
      </p>
    </div>
  );
}
