import { useEffect, useState } from 'react';

export function normalizePath(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return '/';
  if (path === '/students') return '/students';
  if (path === '/team' || path === '/teams') return '/team';
  return '/';
}

export function usePath() {
  const [path, setPath] = useState(() => normalizePath(window.location.pathname));
  useEffect(() => {
    const onPopState = () => setPath(normalizePath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const navigate = (nextPath) => {
    const normalized = normalizePath(nextPath);
    if (window.location.pathname !== normalized) window.history.pushState({}, '', normalized);
    setPath(normalized);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  return [path, navigate];
}
