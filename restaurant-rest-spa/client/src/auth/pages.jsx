import React from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from './api.js';
import { useAuth } from './context.jsx';
import RecaptchaWidget from './recaptcha.jsx';

function AuthFrame({ eyebrow = 'BẾP HỘI', title, intro, children, footer }) {
  return <main className="auth-page"><section className="auth-card">
    <Link to="/" className="auth-brand" aria-label="Bếp Hội — về trang chủ">BẾP <strong>HỘI</strong></Link>
    <p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{intro && <p className="auth-intro">{intro}</p>}
    {children}{footer && <div className="auth-footer">{footer}</div>}
  </section></main>;
}

function Message({ error, notice }) {
  return <>{error && <p className="auth-error" role="alert">{error}</p>}{notice && <p className="auth-notice" role="status">{notice}</p>}</>;
}

function Captcha({ token, setToken, captchaRef }) {
  return <div className="auth-field auth-field-captcha">
    <span className="auth-label">Xác minh reCAPTCHA</span>
    <RecaptchaWidget ref={captchaRef} onToken={setToken} />
    {!token && <small className="auth-help">Hoàn tất reCAPTCHA trước khi gửi biểu mẫu.</small>}
  </div>;
}

function useFormState() {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [captchaToken, setCaptchaToken] = React.useState('');
  const captchaRef = React.useRef(null);
  const finishCaptcha = () => { captchaRef.current?.reset(); setCaptchaToken(''); };
  return { busy, setBusy, error, setError, notice, setNotice, captchaToken, setCaptchaToken, captchaRef, finishCaptcha };
}

function CaptchaForm({ busy, setBusy, error, setError, notice, setNotice, captchaToken, setCaptchaToken, captchaRef, finishCaptcha, onSubmit, children, submitLabel }) {
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!event.currentTarget.reportValidity()) return;
    if (!captchaToken) { setError('Hãy hoàn tất reCAPTCHA trước khi tiếp tục.'); return; }
    setBusy(true);
    try { await onSubmit(event.currentTarget, captchaToken); }
    catch (cause) { setError(cause?.message || 'Yêu cầu chưa thể hoàn tất. Vui lòng thử lại.'); }
    finally { setBusy(false); finishCaptcha(); }
  };
  return <form className="auth-form" onSubmit={submit} noValidate>
    {children}
    <Captcha token={captchaToken} setToken={setCaptchaToken} captchaRef={captchaRef} />
    <Message error={error} notice={notice} />
    <button className="button button-dark auth-submit" type="submit" disabled={busy}>{busy ? 'Đang gửi…' : submitLabel}</button>
  </form>;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const state = useFormState();
  const submit = async (form, recaptchaToken) => {
    const values = new FormData(form);
    const email = String(values.get('email') || '').trim();
    await authApi.register({ email, password: String(values.get('password') || ''), recaptchaToken });
    navigate('/verify-email', { state: { email } });
  };
  return <AuthFrame title="Tạo tài khoản" intro="Đăng ký để quản lý nội dung nhà hàng. Xác minh email xong, bạn sẽ đăng nhập riêng.">
    <CaptchaForm {...state} onSubmit={submit} submitLabel="Gửi mã xác minh">
      <label className="auth-field"><span>Email</span><input name="email" type="email" autoComplete="email" maxLength="254" required /></label>
      <label className="auth-field"><span>Mật khẩu</span><input name="password" type="password" autoComplete="new-password" minLength="12" maxLength="128" required /><small className="auth-help">Ít nhất 12 ký tự.</small></label>
    </CaptchaForm>
    <p className="auth-switch">Đã có tài khoản? <Link to="/login">Đăng nhập</Link></p>
  </AuthFrame>;
}

export function VerifyEmailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = React.useState(location.state?.email || '');
  const [code, setCode] = React.useState('');
  const verify = useFormState();
  const resend = useFormState();

  const verifyCode = async (event) => {
    event.preventDefault(); verify.setBusy(true); verify.setError(''); verify.setNotice('');
    if (!event.currentTarget.reportValidity()) { verify.setBusy(false); return; }
    try {
      await authApi.verifyEmail({ email: email.trim(), code: code.trim() });
      // Email verification intentionally does not establish an authenticated session.
      navigate('/login?verified=1');
    } catch (cause) { verify.setError(cause?.message || 'Không thể xác minh email.'); }
    finally { verify.setBusy(false); }
  };

  const resendCode = async (_form, recaptchaToken) => {
    await authApi.resendOtp({ email: email.trim(), recaptchaToken });
    resend.setNotice('Nếu yêu cầu còn hiệu lực, mã mới đã được gửi đến email của bạn.');
  };

  return <AuthFrame title="Xác minh email" intro="Nếu email đủ điều kiện đăng ký, mã sáu chữ số sẽ được gửi đến hộp thư đó.">
    <form className="auth-form" onSubmit={verifyCode} noValidate>
      <label className="auth-field"><span>Email</span><input type="email" autoComplete="email" maxLength="254" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label className="auth-field"><span>Mã xác minh</span><input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength="6" required /></label>
      <Message error={verify.error} notice={verify.notice} />
      <button className="button button-dark auth-submit" type="submit" disabled={verify.busy}>{verify.busy ? 'Đang xác minh…' : 'Xác minh email'}</button>
    </form>
    <div className="auth-divider"><span>Chưa nhận được mã?</span></div>
    <CaptchaForm {...resend} onSubmit={resendCode} submitLabel="Gửi lại mã">
      <label className="auth-field"><span>Email nhận mã</span><input type="email" autoComplete="email" maxLength="254" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    </CaptchaForm>
    <p className="auth-switch"><Link to="/register">Bắt đầu đăng ký lại</Link></p>
  </AuthFrame>;
}

export function LoginPage() {
  const { login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const state = useFormState();
  const query = new URLSearchParams(location.search);
  const submit = async (form, recaptchaToken) => {
    const values = new FormData(form);
    const user = await login({ email: String(values.get('email') || '').trim(), password: String(values.get('password') || ''), recaptchaToken });
    const destination = location.state?.from?.pathname || (user ? '/admin' : '/');
    navigate(destination.startsWith('/') && !destination.startsWith('//') ? destination : '/admin', { replace: true });
  };
  return <AuthFrame title="Đăng nhập" intro="Đăng nhập để tiếp tục quản lý nhà hàng.">
    <CaptchaForm {...state} onSubmit={submit} submitLabel="Đăng nhập">
      <label className="auth-field"><span>Email</span><input name="email" type="email" autoComplete="username" maxLength="254" required /></label>
      <label className="auth-field"><span>Mật khẩu</span><input name="password" type="password" autoComplete="current-password" maxLength="128" required /></label>
    </CaptchaForm>
    {query.get('verified') === '1' && <p className="auth-notice" role="status">Email đã được xác minh. Bạn có thể đăng nhập.</p>}
    {query.get('reset') === '1' && <p className="auth-notice" role="status">Mật khẩu đã được cập nhật. Hãy đăng nhập bằng mật khẩu mới.</p>}
    {query.get('logout') === 'failed' && <p className="auth-error" role="alert">Đã đăng xuất khỏi trang này, nhưng máy chủ chưa xác nhận. Kiểm tra kết nối rồi gửi lại yêu cầu đăng xuất.</p>}
    <p className="auth-switch"><Link to="/forgot-password">Quên mật khẩu?</Link></p>
    <p className="auth-switch">Chưa có tài khoản? <Link to="/register">Đăng ký</Link></p>
  </AuthFrame>;
}

export function ForgotPasswordPage() {
  const state = useFormState();
  const submit = async (form, recaptchaToken) => {
    const email = String(new FormData(form).get('email') || '').trim();
    await authApi.forgotPassword({ email, recaptchaToken });
    state.setNotice('Nếu email có tài khoản đang hoạt động, hướng dẫn đặt lại mật khẩu sẽ được gửi đến hộp thư đó.');
  };
  return <AuthFrame title="Quên mật khẩu" intro="Nhập email để yêu cầu hướng dẫn đặt lại mật khẩu.">
    <CaptchaForm {...state} onSubmit={submit} submitLabel="Gửi hướng dẫn">
      <label className="auth-field"><span>Email</span><input name="email" type="email" autoComplete="email" maxLength="254" required /></label>
    </CaptchaForm>
    <p className="auth-switch"><Link to="/login">Quay lại đăng nhập</Link></p>
  </AuthFrame>;
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  React.useEffect(() => {
    let meta = document.querySelector('meta[name="referrer"]');
    const created = !meta;
    if (!meta) { meta = document.createElement('meta'); meta.name = 'referrer'; document.head.appendChild(meta); }
    const previous = meta.content;
    meta.content = 'no-referrer';
    return () => { if (created) meta.remove(); else meta.content = previous; };
  }, []);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    if (!event.currentTarget.reportValidity()) { setBusy(false); return; }
    const values = new FormData(event.currentTarget);
    const password = String(values.get('password') || '');
    if (!token) { setError('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.'); setBusy(false); return; }
    if (password !== String(values.get('confirmPassword') || '')) { setError('Hai mật khẩu chưa khớp.'); setBusy(false); return; }
    try {
      await authApi.resetPassword({ token, password });
      setNotice('Mật khẩu đã được cập nhật. Hãy đăng nhập bằng mật khẩu mới.');
      navigate('/login?reset=1', { replace: true });
    } catch (cause) { setError(cause?.message || 'Không thể cập nhật mật khẩu.'); }
    finally { setBusy(false); }
  };
  return <AuthFrame title="Tạo mật khẩu mới" intro="Chọn mật khẩu mới cho tài khoản của bạn.">
    <form className="auth-form" onSubmit={submit} noValidate>
      <label className="auth-field"><span>Mật khẩu mới</span><input name="password" type="password" autoComplete="new-password" minLength="12" maxLength="128" required /></label>
      <label className="auth-field"><span>Nhập lại mật khẩu</span><input name="confirmPassword" type="password" autoComplete="new-password" minLength="12" maxLength="128" required /></label>
      <Message error={error} notice={notice} />
      <button className="button button-dark auth-submit" type="submit" disabled={busy}>{busy ? 'Đang cập nhật…' : 'Đặt lại mật khẩu'}</button>
    </form>
    <p className="auth-switch"><Link to="/forgot-password">Yêu cầu liên kết mới</Link></p>
  </AuthFrame>;
}
