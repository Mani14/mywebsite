import { useEffect, useState } from 'react';

// No shared theme context exists in this app — ThemeToggle owns the choice
// entirely locally and just flips documentElement's data-theme attribute (see
// ThemeToggle.jsx). Components that need to react to theme changes (e.g. to
// pick a light/dark map tile set) read that attribute directly and stay in
// sync via a MutationObserver, rather than a bigger app-wide context refactor.
export function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'light');

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.getAttribute('data-theme') || 'light');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}
