import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authApi } from './api.js';
import { useAuth } from './context.jsx';
import RecaptchaWidget from './recaptcha.jsx';
import {
  formatCountdown,
  getResendCooldownUntil,
  maskEmail,
  otpDigits,
  passwordMetrics,
  passwordPolicyMessage,
  retryDurationFromError,
  startResendCooldown
} from './ui-helpers.js';

function AuthFrame({ eyebrow = 'BẾP HỘI · TÀI KHOẢN', title, intro, children, footer, variant = 'default' }) {
  return <main className={`auth-page auth-page--${variant}`}><div className="auth-shell">
    <aside className="auth-story" aria-label="Bếp Hội, món Việt vị phố Hội">
      <img className="auth-story-photo" src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1100&q=85" alt="" fetchPriority="high" />
      <div className="auth-story-shade" aria-hidden="true" />
      <span className="hero-lantern auth-story-lantern" aria-hidden="true" />
      <span className="hero-lantern auth-story-lantern auth-story-lantern--two" aria-hidden="true" />
      <div className="auth-story-content">
        <Link to="/" className="auth-brand" aria-label="Bếp Hội — về trang chủ">
          <span className="auth-brand-mark" aria-hidden="true">B</span>
          <span>BẾP <strong>HỘI</strong><small>MÓN VIỆT, VỊ PHỐ HỘI</small></span>
        </Link>
        <div className="auth-story-copy">
          <p className="auth-story-eyebrow">HỘI AN · VIỆT NAM</p>
          <p>Một căn bếp nhỏ, những món quen được nấu chậm và luôn có chỗ cho bạn quay về.</p>
        </div>
        <span className="auth-story-caption">CHẬM MỘT NHỊP, NGON MỘT ĐỜI</span>
      </div>
    </aside>
    <section className="auth-card" aria-labelledby="auth-title">
      <p className="auth-eyebrow">{eyebrow}</p>
      <h1 id="auth-title">{title}</h1>
      {intro && <p className="auth-intro">{intro}</p>}
      {children}
      {footer && <div className="auth-footer">{footer}</div>}
    </section>
  </div></main>;
}

function Message({ error, notice, id = 'auth-error' }) {
  return <div className="auth-message-slot">
    {error ? <p id={id} className="auth-error" role="alert">{error}</p> : <span id={id} className="visually-hidden" />}
    {notice && <p className="auth-notice" role="status">{notice}</p>}
  </div>;
}

function FieldError({ id, children }) {
  return <small id={id} className="auth-field-error" aria-live="polite">{children || '\u00a0'}</small>;
}

function useFormState() {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState({});
  const [captchaToken, setCaptchaToken] = React.useState('');
  const captchaRef = React.useRef(null);
  const finishCaptcha = () => { captchaRef.current?.reset(); setCaptchaToken(''); };
  return {
    busy, setBusy, error, setError, notice, setNotice, fieldErrors, setFieldErrors,
    captchaToken, setCaptchaToken, captchaRef, finishCaptcha
  };
}

function nativeFieldErrors(form) {
  const errors = {};
  for (const control of Array.from(form.elements)) {
    if (!control.willValidate || control.validity.valid) continue;
    const key = control.name || control.id;
    if (key) errors[key] = control.validationMessage || 'Hãy kiểm tra thông tin này.';
  }
  return errors;
}

function Captcha({ token, setToken, captchaRef }) {
  return <fieldset className="auth-field-captcha">
    <legend>Xác minh reCAPTCHA</legend>
    <RecaptchaWidget ref={captchaRef} onToken={setToken} />
    {!token && <small className="auth-help">Hoàn tất reCAPTCHA trước khi gửi biểu mẫu.</small>}
  </fieldset>;
}

function SubmitButton({ busy, disabled = false, children, loadingLabel = 'Đang xử lý…' }) {
  return <button className="button button-dark auth-submit" type="submit" disabled={busy || disabled}>
    {busy ? <><span className="auth-spinner" aria-hidden="true" />{loadingLabel}</> : children}
  </button>;
}

function CaptchaForm({
  busy, setBusy, error, setError, notice, setNotice, fieldErrors, setFieldErrors,
  captchaToken, setCaptchaToken, captchaRef, finishCaptcha, onSubmit, onSuccess,
  onFailure, errorMessage, validate, children, submitLabel, loadingLabel, errorId = 'auth-error', disabled = false,
  className = 'auth-form', showMessage = true
}) {
  const submitLocked = React.useRef(false);
  const submit = async (event) => {
    event.preventDefault();
    if (submitLocked.current || disabled) return;
    setError('');
    setNotice('');
    const form = event.currentTarget;
    const errors = { ...nativeFieldErrors(form), ...(validate?.(form) || {}) };
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      const firstName = Object.keys(errors)[0];
      form.elements.namedItem(firstName)?.focus?.();
      return;
    }
    setFieldErrors({});
    if (!captchaToken) { setError('Hãy hoàn tất reCAPTCHA trước khi tiếp tục.'); return; }
    submitLocked.current = true;
    setBusy(true);
    try {
      const result = await onSubmit(form, captchaToken);
      onSuccess?.(result);
    } catch (cause) {
      onFailure?.(cause);
      setError(errorMessage?.(cause) || cause?.message || 'Yêu cầu chưa thể hoàn tất. Vui lòng thử lại.');
    } finally {
      submitLocked.current = false;
      setBusy(false);
      finishCaptcha();
    }
  };
  const clearFieldError = (event) => {
    const name = event.target?.name;
    if (name && (fieldErrors[name] || ((name === 'password' || name === 'confirmPassword') && (fieldErrors.password || fieldErrors.confirmPassword)))) {
      setFieldErrors((current) => {
        const next = { ...current };
        if (name === 'password' || name === 'confirmPassword') {
          delete next.password;
          delete next.confirmPassword;
        } else delete next[name];
        return next;
      });
    }
  };
  return <form className={className} onSubmit={submit} onInput={clearFieldError} noValidate>
    {children}
    <Captcha token={captchaToken} setToken={setCaptchaToken} captchaRef={captchaRef} />
    {showMessage && <Message id={errorId} error={error} notice={notice} />}
    <SubmitButton busy={busy} disabled={disabled} loadingLabel={loadingLabel}>{submitLabel}</SubmitButton>
  </form>;
}

function PasswordInput({ id, name, label, autoComplete, value, onChange, error, describedBy }) {
  const [visible, setVisible] = React.useState(false);
  const errorId = `${id}-error`;
  const descriptions = [describedBy, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return <div className={`auth-field${error ? ' has-error' : ''}`}>
    <label htmlFor={id}>{label}<span className="auth-required" aria-hidden="true"> *</span></label>
    <div className="auth-password-control">
      <input
        id={id} name={name} type={visible ? 'text' : 'password'} autoComplete={autoComplete}
        value={value} onChange={onChange} required aria-invalid={Boolean(error)}
        aria-describedby={descriptions}
      />
      <button
        className="auth-password-toggle" type="button"
        aria-controls={id}
        aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        aria-pressed={visible}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
    <FieldError id={errorId}>{error}</FieldError>
  </div>;
}

function EyeIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.5 12s3.2-6 9.5-6 9.5 6 9.5 6-3.2 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.7" /></svg>;
}

function EyeOffIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m3 3 18 18M10.6 6.2A10.7 10.7 0 0 1 12 6c6.3 0 9.5 6 9.5 6a17 17 0 0 1-3.1 3.7M6.1 6.8C3.7 8.4 2.5 12 2.5 12s3.2 6 9.5 6c1.2 0 2.3-.2 3.3-.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>;
}

function PasswordGuidance({ id, value }) {
  const metrics = passwordMetrics(value);
  const active = value.length > 0;
  const requirements = [
    { label: 'Ít nhất 12 ký tự', met: metrics.longEnough },
    { label: 'Tối đa 128 byte', met: metrics.withinByteLimit },
    { label: 'Một chữ hoa', met: metrics.hasUppercase },
    { label: 'Một chữ số', met: metrics.hasNumber },
    { label: 'Một ký tự đặc biệt', met: metrics.hasSpecialCharacter }
  ];
  return <div id={id} className="auth-password-guidance" aria-live="polite">
    <p className="auth-help">Mật khẩu bắt buộc đáp ứng:</p>
    <ul className="auth-rule-list">
      {requirements.map((requirement) => <li key={requirement.label} className={active && requirement.met ? 'is-met' : ''}><span aria-hidden="true">{active && requirement.met ? '✓' : '·'}</span>{requirement.label}</li>)}
    </ul>
  </div>;
}

function EmailField({ id, name = 'email', label = 'Email', value, onChange, error, autoComplete = 'email', inputRef }) {
  const errorId = `${id}-error`;
  return <div className={`auth-field${error ? ' has-error' : ''}`}>
    <label htmlFor={id}>{label}<span className="auth-required" aria-hidden="true"> *</span></label>
    <input
      id={id} name={name} type="email" autoComplete={autoComplete} maxLength="254" required
      ref={inputRef} value={value} onChange={onChange} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
    />
    <FieldError id={errorId}>{error}</FieldError>
  </div>;
}

function passwordValidation(form) {
  const password = String(new FormData(form).get('password') || '');
  const confirm = String(new FormData(form).get('confirmPassword') || '');
  const errors = {};
  const metrics = passwordMetrics(password);
  if (!metrics.valid) errors.password = passwordPolicyMessage(metrics);
  if (confirm !== password) errors.confirmPassword = 'Hai mật khẩu chưa khớp.';
  return errors;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const state = useFormState();
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const submit = async (form, recaptchaToken) => {
    const values = new FormData(form);
    const email = String(values.get('email') || '').trim();
    return authApi.register({ email, password: String(values.get('password') || ''), captchaToken: recaptchaToken })
      .then(() => navigate('/verify-email', { state: { email } }));
  };
  return <AuthFrame title="Tạo tài khoản" intro="Đăng ký để cùng chăm chút căn bếp. Xác minh email xong, bạn sẽ đăng nhập riêng.">
    <CaptchaForm {...state} validate={passwordValidation} errorMessage={registrationErrorMessage} onSubmit={submit} submitLabel="Gửi mã xác minh" loadingLabel="Đang gửi…">
      <EmailField id="register-email" error={state.fieldErrors.email} />
      <PasswordInput id="register-password" name="password" label="Mật khẩu" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} error={state.fieldErrors.password} describedBy="register-password-guidance" />
      <PasswordGuidance id="register-password-guidance" value={password} />
      <PasswordInput id="register-confirm-password" name="confirmPassword" label="Nhập lại mật khẩu" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} error={state.fieldErrors.confirmPassword} />
    </CaptchaForm>
    <p className="auth-switch">Đã có tài khoản? <Link to="/login">Đăng nhập</Link></p>
  </AuthFrame>;
}

function registrationErrorMessage(error) {
  if (error?.code === 'VALIDATION_FAILED') return 'Hãy kiểm tra email và đảm bảo mật khẩu đáp ứng đủ các yêu cầu.';
  if (error?.code === 'CAPTCHA_REJECTED') return 'Hãy hoàn tất lại reCAPTCHA rồi thử đăng ký.';
  return error?.message || 'Không thể tạo tài khoản lúc này. Vui lòng thử lại.';
}

function useResendCooldown() {
  const [until, setUntil] = React.useState(() => getResendCooldownUntil());
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    if (!until || until <= Date.now()) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [until]);
  React.useEffect(() => {
    if (until && now >= until) setUntil(0);
  }, [now, until]);
  const start = React.useCallback((durationMs) => {
    const deadline = startResendCooldown(undefined, Date.now(), durationMs);
    setUntil(deadline);
    setNow(Date.now());
  }, []);
  return { remaining: Math.max(0, until - now), start };
}

export function VerifyEmailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = React.useState(location.state?.email || '');
  const [emailEditor, setEmailEditor] = React.useState(!location.state?.email);
  const [code, setCode] = React.useState('');
  const [activeDigit, setActiveDigit] = React.useState(-1);
  const emailRef = React.useRef(null);
  const codeRef = React.useRef(null);
  const verify = useFormState();
  const resend = useFormState();
  const cooldown = useResendCooldown();
  const verifyLocked = React.useRef(false);
  const resendCloseTimer = React.useRef(null);
  const resendOpenFrame = React.useRef(null);
  const [resendMounted, setResendMounted] = React.useState(false);
  const [resendExpanded, setResendExpanded] = React.useState(false);
  const resendSeconds = Math.ceil(cooldown.remaining / 1000);

  React.useEffect(() => () => {
    if (resendCloseTimer.current) window.clearTimeout(resendCloseTimer.current);
    if (resendOpenFrame.current) window.cancelAnimationFrame(resendOpenFrame.current);
  }, []);

  const expandResend = () => {
    if (resendCloseTimer.current) {
      window.clearTimeout(resendCloseTimer.current);
      resendCloseTimer.current = null;
    }
    setResendMounted(true);
    if (resendOpenFrame.current) window.cancelAnimationFrame(resendOpenFrame.current);
    resendOpenFrame.current = window.requestAnimationFrame(() => {
      resendOpenFrame.current = null;
      setResendExpanded(true);
    });
  };

  const collapseResend = (resetCaptcha = true) => {
    if (resendOpenFrame.current) {
      window.cancelAnimationFrame(resendOpenFrame.current);
      resendOpenFrame.current = null;
    }
    if (resetCaptcha) resend.finishCaptcha();
    setResendExpanded(false);
    if (resendCloseTimer.current) window.clearTimeout(resendCloseTimer.current);
    resendCloseTimer.current = window.setTimeout(() => {
      setResendMounted(false);
      resendCloseTimer.current = null;
    }, 220);
  };

  const toggleResend = () => {
    if (resend.busy) return;
    if (resendExpanded) collapseResend();
    else if (resendSeconds === 0) expandResend();
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    if (verifyLocked.current) return;
    verify.setBusy(true);
    verify.setError('');
    verify.setNotice('');
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      verify.setFieldErrors({ email: 'Nhập địa chỉ email hợp lệ để xác minh.' });
      verify.setError('');
      emailRef.current?.focus();
      verify.setBusy(false);
      return;
    }
    if (code.length !== 6) {
      verify.setFieldErrors({ code: 'Nhập đủ sáu chữ số trong email của bạn.' });
      verify.setError('');
      codeRef.current?.focus();
      verify.setBusy(false);
      return;
    }
    verify.setFieldErrors({});
    verifyLocked.current = true;
    try {
      await authApi.verifyEmail({ email: email.trim(), code });
      // Email verification intentionally does not establish an authenticated session.
      navigate('/login?verified=1');
    } catch (cause) {
      const messages = {
        OTP_INVALID: 'Mã này chưa thể xác minh. Hãy kiểm tra lại hoặc yêu cầu mã mới.',
        OTP_LOCKED: 'Bạn đã thử mã quá nhiều lần. Vui lòng chờ trước khi thử lại.'
      };
      if (cause?.code === 'OTP_INVALID') {
        setCode('');
        setActiveDigit(0);
        verify.setFieldErrors({ code: messages.OTP_INVALID });
        verify.setError('');
      } else {
        verify.setError(messages[cause?.code] || cause?.message || 'Không thể xác minh email. Hãy thử lại khi kết nối ổn định.');
        if (cause?.code === 'OTP_LOCKED') { setCode(''); setActiveDigit(0); }
      }
    } finally { verifyLocked.current = false; verify.setBusy(false); }
  };

  const resendCode = (_form, captchaToken) =>
    authApi.resendOtp({ email: email.trim(), captchaToken });

  const resendSucceeded = () => {
    resend.setNotice('Nếu yêu cầu đủ điều kiện, mã mới sẽ được gửi đến email đã cung cấp.');
    cooldown.start();
    collapseResend(false);
  };

  const resendFailed = (error) => {
    if (error?.retryAfterMs > 0) cooldown.start(error.retryAfterMs);
  };

  const updateCode = (value) => {
    const next = otpDigits(value);
    setCode(next);
    setActiveDigit(Math.min(next.length, 5));
    if (verify.fieldErrors.code) verify.setFieldErrors((current) => { const errors = { ...current }; delete errors.code; return errors; });
  };
  const focusOtpAtPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const slot = Math.max(0, Math.min(5, Math.floor(((event.clientX - rect.left) / rect.width) * 6)));
    codeRef.current?.focus();
    codeRef.current?.setSelectionRange(slot, slot);
    setActiveDigit(slot);
  };

  return <AuthFrame title="Xác minh email" intro={email ? `Nhập mã sáu chữ số được gửi đến ${maskEmail(email)}.` : 'Nhập địa chỉ email đã dùng để đăng ký, rồi nhập mã sáu chữ số trong hộp thư.'}>
    {emailEditor ? <div className="auth-recipient-editor">
      <EmailField id="verify-email" inputRef={emailRef} value={email} onChange={(event) => { setEmail(event.target.value); setCode(''); verify.setFieldErrors({}); verify.setError(''); }} error={verify.fieldErrors.email} />
    </div> : <div className="auth-recipient">
      <div><span>Đã gửi đến</span><strong>{maskEmail(email)}</strong></div>
      <button type="button" onClick={() => { setEmailEditor(true); window.setTimeout(() => emailRef.current?.focus(), 0); }}>Đổi email</button>
    </div>}
    <form className="auth-form" onSubmit={verifyCode} noValidate>
      <div className="auth-field">
        <label htmlFor="verify-code-input">Mã xác minh<span className="auth-required" aria-hidden="true"> *</span></label>
        <p id="verify-code-help" className="auth-help">Mã gồm đúng sáu chữ số. Bạn có thể dán cả mã vào một lần.</p>
        <div className={`auth-otp${activeDigit >= 0 ? ' is-focused' : ''}${verify.error || verify.fieldErrors.code ? ' is-invalid' : ''}`} onClick={focusOtpAtPointer}>
          <div className="auth-otp-slots" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => <span key={index} className={`auth-otp-slot${code[index] ? ' has-value' : ''}${activeDigit === index ? ' is-active' : ''}`}>{code[index] || ''}</span>)}
          </div>
          <input
            ref={codeRef} id="verify-code-input" className="auth-otp-input" type="text" inputMode="numeric"
            autoComplete="one-time-code" autoCapitalize="off" spellCheck="false" maxLength="6" pattern="[0-9]{6}"
            value={code} onChange={(event) => updateCode(event.target.value)}
            onFocus={() => setActiveDigit(Math.min(code.length, 5))}
            onBlur={() => setActiveDigit(-1)}
            onSelect={(event) => setActiveDigit(Math.min(event.currentTarget.selectionStart ?? code.length, 5))}
            onKeyUp={(event) => setActiveDigit(Math.min(event.currentTarget.selectionStart ?? code.length, 5))}
            aria-label="Mã xác minh gồm sáu chữ số" aria-describedby="verify-code-help verify-code-error verify-error"
            aria-invalid={Boolean(verify.error || verify.fieldErrors.code)} required
          />
        </div>
        <FieldError id="verify-code-error">{verify.fieldErrors.code}</FieldError>
      </div>
      <Message id="verify-error" error={verify.error} notice={verify.notice} />
      <SubmitButton busy={verify.busy} loadingLabel="Đang xác minh…">Xác minh email</SubmitButton>
    </form>
    <section className="auth-resend-block" aria-label="Gửi lại mã xác minh">
      <div className="auth-resend-control">
        <p className="auth-resend-prompt">Chưa nhận được mã?</p>
        <button
          id="resend-toggle" className="auth-resend-toggle" type="button"
          aria-expanded={resendExpanded} aria-controls="resend-panel"
          aria-label={resendSeconds > 0 && !resendExpanded ? `Gửi lại mã sau ${formatCountdown(cooldown.remaining)}` : resendExpanded ? 'Thu gọn phần gửi lại mã' : 'Mở phần gửi lại mã'}
          disabled={resend.busy || (resendSeconds > 0 && !resendExpanded)}
          onClick={toggleResend}
        >
          <span>{resendSeconds > 0 && !resendExpanded ? `Gửi lại sau ${formatCountdown(cooldown.remaining)}` : resendExpanded ? 'Ẩn phần gửi lại' : 'Gửi lại mã'}</span>
          <svg className="auth-resend-chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m3 6 5 5 5-5" /></svg>
        </button>
      </div>
      {(resend.error || resend.notice) && <Message id="resend-error" error={resend.error} notice={resend.notice} />}
      <div
        id="resend-panel" className={`auth-resend-panel${resendExpanded ? ' is-expanded' : ''}`}
        role="region" aria-labelledby="resend-toggle" aria-hidden={!resendExpanded} inert={!resendExpanded}
      >
        <div className="auth-resend-panel-inner">
          {resendMounted && <CaptchaForm
            {...resend} className="auth-form auth-resend-form" showMessage={false}
            onSubmit={resendCode} onSuccess={resendSucceeded} onFailure={resendFailed}
            errorMessage={resendErrorMessage} errorId="resend-error"
            submitLabel="Xác nhận gửi lại mã" loadingLabel="Đang gửi mã…"
            disabled={resendSeconds > 0}
          >
            <input type="hidden" name="email" value={email} />
          </CaptchaForm>}
        </div>
      </div>
    </section>
    <p className="auth-switch"><Link to="/login">Quay lại đăng nhập</Link><span aria-hidden="true"> · </span><Link to="/register">Đăng ký lại</Link></p>
  </AuthFrame>;
}

function loginErrorMessage(error) {
  if (error?.code === 'LOGIN_INVALID') return 'Email hoặc mật khẩu không chính xác.';
  if (error?.code === 'LOGIN_LOCKED') return 'Có quá nhiều lần đăng nhập chưa thành công. Vui lòng chờ rồi thử lại.';
  if (error?.code === 'CAPTCHA_REJECTED') return 'Hãy hoàn tất lại reCAPTCHA rồi thử đăng nhập.';
  return error?.message || 'Không thể đăng nhập lúc này. Vui lòng thử lại.';
}

function resendErrorMessage(error) {
  if (error?.code === 'CAPTCHA_REJECTED') return 'Hãy hoàn tất lại reCAPTCHA rồi thử gửi mã.';
  if (error?.code === 'RATE_LIMITED') return 'Đã có nhiều yêu cầu gần đây. Vui lòng chờ rồi thử lại.';
  return error?.message || 'Không thể gửi mã lúc này. Vui lòng thử lại.';
}

export function LoginPage() {
  const { login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const state = useFormState();
  const query = new URLSearchParams(location.search);
  const [password, setPassword] = React.useState('');
  const [lockout, setLockout] = React.useState(null);
  const lockoutVersion = React.useRef(0);
  const [remainingMs, setRemainingMs] = React.useState(0);

  React.useEffect(() => {
    if (!lockout) return undefined;
    const startedAt = performance.now();
    const duration = lockout.durationMs;
    const tick = () => {
      const remaining = Math.max(0, duration - (performance.now() - startedAt));
      setRemainingMs(remaining);
      if (remaining === 0 && lockoutVersion.current === lockout.version) {
        setLockout(null);
        state.setError('');
      }
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [lockout]);

  const submit = async (form, captchaToken) => {
    const values = new FormData(form);
    const user = await login({ email: String(values.get('email') || '').trim(), password: String(values.get('password') || ''), captchaToken });
    const destination = location.state?.from?.pathname || (user ? '/admin' : '/');
    navigate(destination.startsWith('/') && !destination.startsWith('//') ? destination : '/admin', { replace: true });
  };
  const handleFailure = (error) => {
    if (error?.code !== 'LOGIN_LOCKED') return;
    const durationMs = retryDurationFromError(error);
    if (!durationMs) return;
    lockoutVersion.current += 1;
    setLockout({ durationMs, version: lockoutVersion.current });
    setRemainingMs(durationMs);
  };
  const remaining = Math.max(0, Math.ceil(remainingMs / 1000));

  return <AuthFrame variant="login" title="Đăng nhập" intro="Đăng nhập để tiếp tục.">
    <CaptchaForm
      {...state} onSubmit={submit} onFailure={handleFailure} errorMessage={loginErrorMessage}
      submitLabel="Đăng nhập" loadingLabel="Đang đăng nhập…" disabled={remaining > 0}
    >
      <EmailField id="login-email" autoComplete="username" error={state.fieldErrors.email} />
      <PasswordInput
        id="login-password" name="password" label="Mật khẩu" autoComplete="current-password"
        value={password} onChange={(event) => setPassword(event.target.value)} error={state.fieldErrors.password}
      />
      <div className="auth-inline-link"><Link to="/forgot-password">Quên mật khẩu?</Link></div>
    </CaptchaForm>
    {remaining > 0 && <p className="auth-lockout">Có quá nhiều lần đăng nhập chưa thành công. Vui lòng thử lại sau <time aria-live="off">{formatCountdown(remainingMs)}</time>.</p>}
    {query.get('verified') === '1' && <p className="auth-notice" role="status">Email đã được xác minh. Bạn có thể đăng nhập.</p>}
    {query.get('reset') === '1' && <p className="auth-notice" role="status">Mật khẩu đã được cập nhật. Hãy đăng nhập bằng mật khẩu mới.</p>}
    {query.get('logout') === 'failed' && <p className="auth-error" role="alert">Máy chủ chưa xác nhận đăng xuất. Kiểm tra kết nối rồi thử lại.</p>}
    <p className="auth-switch">Chưa có tài khoản? <Link to="/register">Đăng ký</Link></p>
  </AuthFrame>;
}

export function ForgotPasswordPage() {
  const state = useFormState();
  const [complete, setComplete] = React.useState(false);
  const submit = async (form, captchaToken) => {
    const email = String(new FormData(form).get('email') || '').trim();
    await authApi.forgotPassword({ email, captchaToken });
  };
  return <AuthFrame title={complete ? 'Kiểm tra hộp thư' : 'Quên mật khẩu'} intro={complete ? undefined : 'Nhập email đã dùng cho tài khoản. Bếp sẽ gửi hướng dẫn nếu địa chỉ này đủ điều kiện.'}>
    {complete ? <Confirmation icon="✉" title="Yêu cầu đã được tiếp nhận" text="Nếu địa chỉ email đủ điều kiện, hướng dẫn đặt lại mật khẩu sẽ sớm đến hộp thư. Hãy kiểm tra cả thư mục quảng cáo hoặc thư rác." /> : <CaptchaForm
      {...state} onSubmit={submit} onSuccess={() => setComplete(true)}
      submitLabel="Gửi hướng dẫn" loadingLabel="Đang gửi yêu cầu…"
    >
      <EmailField id="forgot-email" error={state.fieldErrors.email} />
    </CaptchaForm>}
    <p className="auth-switch"><Link to="/login">Quay lại đăng nhập</Link></p>
  </AuthFrame>;
}

function Confirmation({ icon, title, text, children }) {
  return <section className="auth-confirmation" aria-live="polite">
    <span className="auth-confirmation-icon" aria-hidden="true">{icon}</span>
    <h2>{title}</h2>
    <p>{text}</p>
    {children}
  </section>;
}

export function ResetPasswordPage() {
  const location = useLocation();
  const token = React.useMemo(() => new URLSearchParams(location.hash.slice(1)).get('token') || '', [location.hash]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [complete, setComplete] = React.useState(false);
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState({});
  const resetLocked = React.useRef(false);

  React.useEffect(() => {
    if (token && location.hash) window.history.replaceState(window.history.state, '', `${location.pathname}${location.search}`);
    let meta = document.querySelector('meta[name="referrer"]');
    const created = !meta;
    if (!meta) { meta = document.createElement('meta'); meta.name = 'referrer'; document.head.appendChild(meta); }
    const previous = meta.content;
    meta.content = 'no-referrer';
    return () => { if (created) meta.remove(); else meta.content = previous; };
  }, [location.hash, location.pathname, location.search, token]);

  const submit = async (event) => {
    event.preventDefault();
    if (resetLocked.current) return;
    setBusy(true);
    setError('');
    setFieldErrors({});
    const metrics = passwordMetrics(password);
    const nextErrors = {};
    if (!metrics.valid) nextErrors.password = passwordPolicyMessage(metrics);
    if (password !== confirmPassword) nextErrors.confirmPassword = 'Hai mật khẩu chưa khớp.';
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      setBusy(false);
      return;
    }
    if (!token) { setError('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.'); setBusy(false); return; }
    resetLocked.current = true;
    try {
      await authApi.resetPassword({ token, newPassword: password });
      setComplete(true);
    } catch (cause) {
      const messages = {
        RESET_INVALID: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới.',
        VALIDATION_FAILED: 'Mật khẩu cần có ít nhất 12 ký tự, không quá 128 byte, một chữ hoa, một chữ số và một ký tự đặc biệt.'
      };
      setError(messages[cause?.code] || cause?.message || 'Không thể cập nhật mật khẩu lúc này.');
    } finally { resetLocked.current = false; setBusy(false); }
  };

  const invalidLink = !token && !complete;
  return <AuthFrame title={complete ? 'Mật khẩu đã được cập nhật' : invalidLink ? 'Liên kết không khả dụng' : 'Tạo mật khẩu mới'} intro={complete || invalidLink ? undefined : 'Chọn mật khẩu mới cho tài khoản của bạn.'}>
    {complete ? <Confirmation icon="✓" title="Bạn đã sẵn sàng quay lại" text="Đăng nhập bằng mật khẩu mới để tiếp tục." /> : invalidLink ? <Confirmation icon="↗" title="Yêu cầu một liên kết mới" text="Liên kết có thể đã hết hạn hoặc đã được sử dụng. Hãy gửi yêu cầu đặt lại mật khẩu mới."><Link className="button button-dark auth-submit" to="/forgot-password">Gửi yêu cầu mới</Link></Confirmation> : <form className="auth-form" onInput={(event) => { const name = event.target?.name; if (name && (fieldErrors[name] || ((name === 'password' || name === 'confirmPassword') && (fieldErrors.password || fieldErrors.confirmPassword)))) setFieldErrors((current) => { const next = { ...current }; if (name === 'password' || name === 'confirmPassword') { delete next.password; delete next.confirmPassword; } else delete next[name]; return next; }); }} onSubmit={submit} noValidate>
      <PasswordInput id="reset-password" name="password" label="Mật khẩu mới" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} error={fieldErrors.password} describedBy="reset-password-guidance" />
      <PasswordGuidance id="reset-password-guidance" value={password} />
      <PasswordInput id="reset-confirm-password" name="confirmPassword" label="Nhập lại mật khẩu" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} error={fieldErrors.confirmPassword} />
      <Message error={error} />
      <SubmitButton busy={busy} loadingLabel="Đang cập nhật…">Đặt lại mật khẩu</SubmitButton>
    </form>}
    <p className="auth-switch"><Link to="/login">Quay lại đăng nhập</Link></p>
  </AuthFrame>;
}
