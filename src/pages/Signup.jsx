import { useState } from "react";
import { supabase } from "../supabaseClient";
import "../styles/auth.css";

export default function Signup({ onSwitchToLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      // Check if error indicates user already exists
      if (error.message.includes("already registered") || error.message.includes("already exists") || error.message.includes("User already registered")) {
        setError(`An account with this email already exists. Please log in instead.`);
      } else {
        setError(error.message);
      }
    } else {
      setSuccess("Check your email for a confirmation link!");
      setEmail("");
      setPassword("");
    }
  };

  return (
    <div className="auth-container">
      <h2>Sign Up</h2>
      <form onSubmit={handleSignup}>
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
        <button type="submit">Sign Up</button>
      </form>
      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}
      <p style={{ color: 'white', marginTop: '1rem', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
        Already have an account?{" "}
        <button 
          type="button"
          onClick={onSwitchToLogin}
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
          Log in
        </button>
      </p>
    </div>
  );
}
