import { useCallback, useEffect, useState } from 'react';

export class ApiError extends Error {
  constructor(message, status, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = details.code;
    this.fields = details.fields || {};
  }
}

export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      method: options.method || 'GET',
      headers: options.body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError('Không thể kết nối đến máy chủ. Vui lòng thử lại.', 0);
  }
  let payload;
  try { payload = await response.json(); }
  catch { throw new ApiError('Máy chủ chưa thể hoàn tất yêu cầu. Vui lòng thử lại sau.', response.status); }
  if (!response.ok || payload?.ok !== true) {
    const error = payload?.error;
    if (error && typeof error === 'object') {
      throw new ApiError(error.message || 'Yêu cầu chưa thể hoàn tất.', response.status, error);
    }
    throw new ApiError(typeof error === 'string' ? error : 'Máy chủ chưa thể hoàn tất yêu cầu. Vui lòng thử lại sau.', response.status);
  }
  return payload.data;
}

export function useLoad(path) {
  const [state, setState] = useState({ data: null, loading: Boolean(path), error: '', errorCode: '', fields: {}, version: 0 });
  const reload = useCallback(() => setState((old) => ({ ...old, loading: true, error: '', errorCode: '', fields: {}, version: old.version + 1 })), []);
  const mutate = useCallback((updater) => setState((old) => ({
    ...old,
    data: typeof updater === 'function' ? updater(old.data) : updater
  })), []);
  useEffect(() => {
    if (!path) { setState({ data: null, loading: false, error: '', errorCode: '', fields: {}, version: 0 }); return undefined; }
    const controller = new AbortController();
    setState((old) => ({ ...old, loading: true, error: '', errorCode: '', fields: {} }));
    api(path, { signal: controller.signal })
      .then((data) => setState((old) => ({ ...old, data, loading: false, error: '', errorCode: '', fields: {} })))
      .catch((error) => {
        if (error.name !== 'AbortError') setState((old) => ({ ...old, loading: false, error: error.message, errorCode: error.code || '', fields: error.fields || {} }));
      });
    return () => controller.abort();
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
