import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../lib/firebase';

// Firebase-Auth (Google) gate for the app, plus the per-user "me" link stored in
// Firestore (users/<uid>.meId) so your attachment follows you across devices.
export function useAuth() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [meId, setMeId] = useState(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u ? { uid: u.uid, email: u.email, name: u.displayName, picture: u.photoURL } : null);
      if (!u) setMeId(null);
      setAuthReady(true);
    });
  }, []);

  // Live per-user "me" link.
  useEffect(() => {
    if (!user?.uid) return undefined;
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      setMeId(snap.exists() ? snap.data().meId ?? null : null);
    });
  }, [user?.uid]);

  const signIn = useCallback(() => {
    googleProvider.setCustomParameters({ prompt: 'select_account' });
    return signInWithPopup(auth, googleProvider).catch(() => {});
  }, []);

  const signOut = useCallback(() => fbSignOut(auth), []);

  const setMe = useCallback(
    (personId) => {
      if (!user?.uid) return;
      setMeId(personId); // optimistic; the snapshot listener will confirm
      setDoc(doc(db, 'users', user.uid), { meId: personId ?? null }, { merge: true }).catch(() => {});
    },
    [user?.uid]
  );

  return { user, authReady, signIn, signOut, meId, setMe };
}
