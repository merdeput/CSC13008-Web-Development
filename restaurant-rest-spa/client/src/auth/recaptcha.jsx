import React from 'react';

const SITE_KEY = import.meta.env?.VITE_RECAPTCHA_SITE_KEY || '';

function loadRecaptcha() {
  if (window.grecaptcha?.render) return Promise.resolve(window.grecaptcha);
  if (window.__bephoiRecaptchaLoad) return window.__bephoiRecaptchaLoad;
  window.__bephoiRecaptchaLoad = new Promise((resolve, reject) => {
    let script = document.querySelector('script[data-bephoi-recaptcha]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.bephoiRecaptcha = 'true';
      document.head.appendChild(script);
    }
    const timer = window.setTimeout(() => reject(new Error('reCAPTCHA is taking too long to load.')), 15000);
    script.addEventListener('load', () => {
      window.clearTimeout(timer);
      if (window.grecaptcha?.ready) window.grecaptcha.ready(() => resolve(window.grecaptcha));
      else reject(new Error('reCAPTCHA could not start.'));
    }, { once: true });
    script.addEventListener('error', () => {
      window.clearTimeout(timer);
      reject(new Error('Could not load reCAPTCHA. Check your connection and try again.'));
    }, { once: true });
  }).catch((error) => {
    window.__bephoiRecaptchaLoad = null;
    throw error;
  });
  return window.__bephoiRecaptchaLoad;
}

const RecaptchaWidget = React.forwardRef(function RecaptchaWidget({ onToken }, ref) {
  const host = React.useRef(null);
  const widgetId = React.useRef(null);
  const tokenHandler = React.useRef(onToken);
  const [message, setMessage] = React.useState('');
  tokenHandler.current = onToken;

  React.useImperativeHandle(ref, () => ({
    reset() {
      if (widgetId.current !== null && window.grecaptcha?.reset) window.grecaptcha.reset(widgetId.current);
      tokenHandler.current?.('');
    }
  }), []);

  React.useEffect(() => {
    if (!SITE_KEY) {
      setMessage('reCAPTCHA is not configured. Set VITE_RECAPTCHA_SITE_KEY to enable this form.');
      return undefined;
    }
    let mounted = true;
    loadRecaptcha().then((captcha) => {
      if (!mounted || !host.current || widgetId.current !== null) return;
      widgetId.current = captcha.render(host.current, {
        sitekey: SITE_KEY,
        theme: 'light',
        callback: (token) => tokenHandler.current?.(token),
        'expired-callback': () => tokenHandler.current?.(''),
        'error-callback': () => {
          tokenHandler.current?.('');
          setMessage('reCAPTCHA could not be verified. Please try again.');
        }
      });
      setMessage('');
    }).catch((error) => { if (mounted) setMessage(error.message); });
    return () => { mounted = false; };
  }, []);

  return <div className="auth-captcha">
    <div ref={host} />
    {message && <p className="auth-captcha-message" role="status">{message}</p>}
  </div>;
});

export default RecaptchaWidget;
