import { useEffect, useRef } from 'react';
import { GitBranch } from 'lucide-react';
import '../styles/Login.css';

export default function Login({ gsiReady, clientId }) {
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!gsiReady || !buttonRef.current || !window.google) return;
    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: 'filled_blue',
      size: 'large',
      shape: 'pill',
      text: 'signin_with',
    });
  }, [gsiReady]);

  return (
    <div className="login-screen">
      <div className="login-card glass-surface">
        <GitBranch size={32} className="login-icon" />
        <h1>Family Tree</h1>
        <p>Sign in with Google to view and edit the family tree.</p>
        {clientId ? (
          <div ref={buttonRef} className="login-google-btn" />
        ) : (
          <p className="login-error">
            Missing <code>VITE_GOOGLE_CLIENT_ID</code>. Add it to <code>.env.local</code> and restart the dev server.
          </p>
        )}
      </div>
    </div>
  );
}
