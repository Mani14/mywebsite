import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'family-hierarchy-auth-user';
const ME_KEY_PREFIX = 'family-hierarchy-me-';
const GSI_SRC = 'https://accounts.google.com/gsi/client';

function loadGsiScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Decodes a JWT's payload without verifying its signature — acceptable here
// only because this is a client-side-only access gate (no backend to trust
// the claims for), not a real authorization boundary.
function decodeJwtPayload(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function readMeId(email) {
  if (!email) return null;
  try {
    return localStorage.getItem(ME_KEY_PREFIX + email);
  } catch {
    return null;
  }
}

// Client-side "Sign in with Google" gate for this static SPA. There is no
// backend to verify the ID token's signature, so this only controls whether
// the UI renders — it is not a real security boundary against a determined
// user with dev tools. Good enough for keeping casual visitors out.
export function useAuth() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [gsiReady, setGsiReady] = useState(false);
  // Which family-tree person this signed-in Google account is linked to (set via
  // "Mark as Me" or the "Attach Yourself" wizard) — persisted per-email so
  // different signed-in users on the same browser each keep their own link.
  const [meId, setMeId] = useState(() => readMeId(user?.email));

  const handleCredential = useCallback((response) => {
    const claims = decodeJwtPayload(response.credential);
    if (!claims?.email) return;
    const nextUser = { email: claims.email, name: claims.name, picture: claims.picture };
    setUser(nextUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
    setMeId(readMeId(nextUser.email));
  }, []);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    loadGsiScript()
      .then(() => {
        if (cancelled) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredential,
        });
        setGsiReady(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [clientId, handleCredential]);

  const signOut = useCallback(() => {
    setUser(null);
    setMeId(null);
    localStorage.removeItem(STORAGE_KEY);
    window.google?.accounts.id.disableAutoSelect();
  }, []);

  const setMe = useCallback(
    (personId) => {
      if (!user?.email) return;
      setMeId(personId);
      try {
        if (personId) localStorage.setItem(ME_KEY_PREFIX + user.email, personId);
        else localStorage.removeItem(ME_KEY_PREFIX + user.email);
      } catch {
        // ignore storage failures (e.g. private browsing quota)
      }
    },
    [user?.email]
  );

  return { user, signOut, gsiReady, clientId, meId, setMe };
}
