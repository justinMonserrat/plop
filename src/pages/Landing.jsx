import '../App.css'

function Landing({ onGetStarted, onSignIn }) {
  return (
    <div className="landing-page">
      <main className="hero-section">
        <div className="hero-content">
          <h1 className="logo">plop</h1>
          <p className="tagline">Where your thoughts make a splash</p>
          <div className="cta-buttons">
            <button className="btn btn-primary" onClick={onGetStarted}>Get Started</button>
            <button className="btn btn-secondary" onClick={onSignIn}>Sign In</button>
          </div>
        </div>
      </main>
    </div>
  )
}

export default Landing