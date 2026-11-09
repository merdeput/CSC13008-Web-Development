import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, request } from './auth/http.js';
export { ApiError };

export async function api(path, options = {}) {
  return request(path, options);
}

export function useLoad(path) {
  const [state, setState] = useState({ data: null, loading: Boolean(path), error: '', errorCode: '', fields: {}, version: 0 });
  const controllerRef = useRef(null);
  const reload = useCallback(() => setState((old) => ({ ...old, loading: true, error: '', errorCode: '', fields: {}, version: old.version + 1 })), []);
  const mutate = useCallback((updater) => setState((old) => ({
    ...old,
    data: typeof updater === 'function' ? updater(old.data) : updater
  })), []);
  useEffect(() => {
    if (!path?.startsWith('/api/admin') || typeof window === 'undefined') return undefined;
    const invalidate = (event) => {
      controllerRef.current?.abort();
      setState((old) => ({
        ...old, data: null, loading: Boolean(event.detail?.reload), error: '', errorCode: '', fields: {},
        version: old.version + (event.detail?.reload ? 1 : 0)
      }));
    };
    window.addEventListener('private-cache-invalidated', invalidate);
    return () => window.removeEventListener('private-cache-invalidated', invalidate);
  }, [path]);
  useEffect(() => {
    if (!path) { setState({ data: null, loading: false, error: '', errorCode: '', fields: {}, version: 0 }); return undefined; }
    const controller = new AbortController();
    controllerRef.current = controller;
    setState((old) => ({ ...old, loading: true, error: '', errorCode: '', fields: {} }));
    api(path, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setState((old) => ({ ...old, data, loading: false, error: '', errorCode: '', fields: {} })); })
      .catch((error) => {
        if (!controller.signal.aborted && error.name !== 'AbortError') setState((old) => ({ ...old, loading: false, error: error.message, errorCode: error.code || '', fields: error.fields || {} }));
      });
    return () => { controller.abort(); if (controllerRef.current === controller) controllerRef.current = null; };
  }, [path, state.version]);
  return { ...state, reload, mutate };
}

export function money(value) {
  return `${new Intl.NumberFormat('vi-VN').format(Number(value) || 0)} ₫`;
}

export function dateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));
}

export function dateTimeInputs(value) {
  if (!value) return { date: '', time: '' };
  const local = new Date(new Date(value).getTime() + 7 * 60 * 60 * 1000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}
