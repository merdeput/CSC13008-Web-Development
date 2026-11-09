import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context.jsx';
import { routeAccess } from './route-access.js';

function RestoreState({ error, retryRestore }) {
  return <main className="auth-page"><section className="auth-card" aria-live="polite">
    <p className="eyebrow">BẾP HỘI</p><h1>Đang kiểm tra phiên đăng nhập</h1>
    {error ? <><p className="auth-error" role="alert">{error}</p><button className="button button-dark auth-submit" type="button" onClick={retryRestore}>Thử lại</button></> : <p role="status">Vui lòng chờ trong giây lát…</p>}
  </section></main>;
}

export function ProtectedRoute({ children, roles }) {
  const auth = useAuth();
  const location = useLocation();
  const decision = routeAccess(auth.status, auth.user, roles);
  if (decision === 'loading') return <RestoreState error={auth.error} retryRestore={auth.retryRestore} />;
  if (decision === 'redirect') return <Navigate to="/login" replace state={{ from: location }} />;
  if (decision === 'forbidden') return <main className="auth-page"><section className="auth-card"><h1>Không có quyền truy cập</h1><p>Tài khoản này không được phép mở trang đó.</p></section></main>;
  return children;
}

export function GuestRoute({ children }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.status === 'loading') return <RestoreState error={auth.error} retryRestore={auth.retryRestore} />;
  if (auth.status === 'authenticated') {
    const requested = location.state?.from?.pathname;
    const safeRequested = typeof requested === 'string' && requested.startsWith('/') && !requested.startsWith('//');
    const destination = safeRequested ? requested : '/admin';
    return <Navigate to={destination} replace />;
  }
  return children;
}
