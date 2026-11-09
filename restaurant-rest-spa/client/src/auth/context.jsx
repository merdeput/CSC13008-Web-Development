import React from 'react';
import { authApi, userFrom } from './api.js';
import { clearAccessToken, invalidatePrivateCache } from './http.js';

const AuthContext = React.createContext(null);

export function AuthProvider({ children }) {
  const [status, setStatus] = React.useState('loading');
  const [user, setUser] = React.useState(null);
  const [error, setError] = React.useState('');
  const channelRef = React.useRef(null);

  const restore = React.useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const result = await authApi.restore();
      const restoredUser = userFrom(result);
      setUser(restoredUser);
      setStatus(restoredUser ? 'authenticated' : 'unauthenticated');
      return restoredUser;
    } catch (cause) {
      setError(cause?.message || 'Could not restore your session.');
      // Keep the loading state so protected content stays covered until retry succeeds.
      setStatus('loading');
      return null;
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    authApi.restore().then((result) => {
      if (!active) return;
      const restoredUser = userFrom(result);
      setUser(restoredUser);
      setStatus(restoredUser ? 'authenticated' : 'unauthenticated');
    }).catch((cause) => {
      if (!active) return;
      setError(cause?.message || 'Could not restore your session.');
      setStatus('loading');
    });

    const onExpired = () => {
      clearAccessToken();
      invalidatePrivateCache();
      setUser(null);
      setError('');
      setStatus('unauthenticated');
    };
    const onUnavailable = (event) => {
      clearAccessToken();
      invalidatePrivateCache();
      setUser(null);
      setError(event.detail?.message || 'Could not verify your session.');
      setStatus('loading');
    };
    window.addEventListener('auth-session-expired', onExpired);
    window.addEventListener('auth-session-unavailable', onUnavailable);

    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('bephoi-auth');
      channelRef.current = channel;
      channel.onmessage = ({ data }) => {
        if (data?.type === 'logout') {
          clearAccessToken();
          invalidatePrivateCache();
          setUser(null);
          setError('');
          setStatus('unauthenticated');
        } else if (data?.type === 'account-changed') {
          clearAccessToken();
          invalidatePrivateCache();
          void restore();
        }
      };
    }
    return () => {
      active = false;
      window.removeEventListener('auth-session-expired', onExpired);
      window.removeEventListener('auth-session-unavailable', onUnavailable);
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, [restore]);

  const login = React.useCallback(async (credentials) => {
    setError('');
    try {
      const nextUser = await authApi.login(credentials);
      setUser(nextUser);
      setStatus('authenticated');
      channelRef.current?.postMessage({ type: 'account-changed' });
      return nextUser;
    } catch (cause) {
      setUser(null);
      setStatus('unauthenticated');
      throw cause;
    }
  }, []);

  const logout = React.useCallback(async () => {
    let logoutError = null;
    try { await authApi.logout(); }
    catch (cause) { logoutError = cause; }
    finally {
      setUser(null);
      setError('');
      setStatus('unauthenticated');
      channelRef.current?.postMessage({ type: 'logout' });
    }
    return logoutError;
  }, []);

  const value = React.useMemo(() => ({
    status, user, error, login, logout, retryRestore: restore
  }), [status, user, error, login, logout, restore]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = React.useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
