import { useState } from "react";
import { supabase } from "../supabaseClient";
import "../styles/auth.css";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // Check if user doesn't exist - suggest signup
        if (error.message.includes("Invalid login credentials") || error.message.includes("Invalid email")) {
          setError("Account not found. Would you like to sign up instead?");
        } else {
          setError(error.message);
        }
      } else {
        window.location.reload();
      }
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        // Check if error indicates user already exists
        if (error.message.includes("already registered") || 
            error.message.includes("already exists") || 
            error.message.includes("User already registered") ||
            error.message.includes("already been registered")) {
          setError("An account with this email already exists. Please log in instead.");
          setIsLogin(true);
        } else {
          setError(error.message);
        }
      } else {
        setSuccess("Check your email for a confirmation link!");
        setEmail("");
        setPassword("");
      }
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Please enter your email address first");
      return;
    }
    setIsResetting(true);
    setError("");
    setSuccess("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      setError(error.message);
      setIsResetting(false);
    } else {
      setSuccess("Password reset email sent! Check your inbox.");
      setIsResetting(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-header">
        <h1 className="auth-logo">plop</h1>
        <p className="auth-tagline">Where your thoughts make a splash</p>
      </div>
      
      <div className="auth-toggle">
        <button
          type="button"
          className={`toggle-btn ${isLogin ? "active" : ""}`}
          onClick={() => {
            setIsLogin(true);
            setError("");
            setSuccess("");
          }}
        >
          Log In
        </button>
        <button
          type="button"
          className={`toggle-btn ${!isLogin ? "active" : ""}`}
          onClick={() => {
            setIsLogin(false);
            setError("");
            setSuccess("");
          }}
        >
          Sign Up
        </button>
      </div>

      <form onSubmit={handleSubmit}>
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
        <button type="submit">{isLogin ? "Log In" : "Sign Up"}</button>
        {isLogin && (
          <button 
            type="button"
            onClick={handleForgotPassword}
            disabled={isResetting}
            className="forgot-password-btn"
          >
            {isResetting ? "Sending..." : "Forgot Password?"}
          </button>
        )}
      </form>
      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}
    </div>
  );
}

