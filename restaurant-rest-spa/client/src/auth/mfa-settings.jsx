import React from 'react';
import { api } from '../api.js';

export default function MfaSettingsPage() {
  const [status, setStatus] = React.useState(null);
  const [setup, setSetup] = React.useState(null);
  const [recoveryCodes, setRecoveryCodes] = React.useState(null);
  const [password, setPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  const [verifyCode, setVerifyCode] = React.useState('');
  const [replacePrompt, setReplacePrompt] = React.useState(false);
  const [replacePassword, setReplacePassword] = React.useState('');
  const [replaceCode, setReplaceCode] = React.useState('');
  const [disablePassword, setDisablePassword] = React.useState('');
  const [disableCode, setDisableCode] = React.useState('');
  const [recoveryPassword, setRecoveryPassword] = React.useState('');
  const [recoveryCode, setRecoveryCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');

  const loadStatus = React.useCallback(async () => {
    const next = await api('/api/auth/mfa/status', { protected: true });
    setStatus(next);
  }, []);

  React.useEffect(() => { loadStatus().catch(() => setError('Không thể tải cài đặt bảo mật.')); }, [loadStatus]);

  async function perform(path, body) {
    if (busy) return null;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      return await api(path, { method: 'POST', body, protected: true });
    } catch (cause) {
      const messages = {
        MFA_LOCKED: 'Bạn đã nhập sai quá nhiều mã. Hãy chờ rồi thử lại.',
        REAUTH_REQUIRED: 'Mật khẩu hoặc mã xác thực chưa đúng.',
        INVALID_MFA_CODE: 'Mã không đúng, đã hết hạn hoặc đã được sử dụng.',
        MFA_SETUP_EXPIRED: 'Cài đặt đã hết hạn. Hãy bắt đầu lại.',
        MFA_NOT_ENABLED: 'Xác thực đa yếu tố chưa được bật cho tài khoản này.'
      };
      setError(messages[cause?.code] || 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.');
      return null;
    } finally { setBusy(false); }
  }

  async function beginSetup(event) {
    event.preventDefault();
    const result = await perform('/api/auth/mfa/setup', { password, code: '' });
    if (result) {
      setSetup(result);
      setRecoveryCodes(null);
      setCode('');
      setPassword('');
      setNotice('Quét mã QR hoặc nhập khóa thủ công, sau đó xác minh mã mới để hoàn tất cài đặt.');
    }
  }

  async function confirmSetup(event) {
    event.preventDefault();
    const result = await perform('/api/auth/mfa/confirm-setup', { code: verifyCode });
    if (result) {
      setSetup(null);
      setRecoveryCodes(result.recoveryCodes);
      setPassword('');
      setCode('');
      setVerifyCode('');
      await loadStatus();
      setNotice('Đã bật xác thực đa yếu tố. Hãy lưu các mã khôi phục này ngay.');
    }
  }

  async function disable(event) {
    event.preventDefault();
    const result = await perform('/api/auth/mfa/disable', { password: disablePassword, code: disableCode });
    if (result) {
      setDisablePassword('');
      setDisableCode('');
      setSetup(null);
      setRecoveryCodes(null);
      await loadStatus();
      setNotice('Đã tắt xác thực đa yếu tố.');
    }
  }

  async function replaceRecoveryCodes() {
    const result = await perform('/api/auth/mfa/recovery-codes', { password: recoveryPassword, code: recoveryCode });
    if (result) {
      setRecoveryCodes(result.recoveryCodes);
      setRecoveryPassword('');
      setRecoveryCode('');
      await loadStatus();
      setNotice('Đã tạo bộ mã khôi phục mới. Các mã cũ không còn sử dụng được.');
    }
  }

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      setNotice('Đã sao chép mã khôi phục. Hãy lưu chúng ở nơi riêng tư.');
    } catch {
      setError('Không thể dùng bộ nhớ tạm. Hãy chọn và sao chép mã khôi phục thủ công.');
    }
  }

  return <section className="mfa-settings">
    <header className="admin-page-heading"><div><p className="eyebrow">BẢO MẬT TÀI KHOẢN</p><h1>Xác thực đa yếu tố</h1><p>Dùng ứng dụng xác thực để bảo vệ quyền truy cập quản trị.</p></div></header>
    {error && <div className="form-error-summary" role="alert">{error}</div>}
    {notice && <p className="mfa-notice" role="status">{notice}</p>}
    {!status ? <section className="admin-panel"><p role="status">Đang tải cài đặt bảo mật…</p></section> : <>
      <section className="admin-panel mfa-panel">
        <div className="admin-panel-heading"><div><p className="eyebrow">ỨNG DỤNG XÁC THỰC</p><h2>{status.enabled ? 'Đã bật' : 'Chưa bật'}</h2></div>{status.enabled && <span className="mfa-count">Còn {status.recoveryCodesRemaining} mã khôi phục</span>}</div>
        <p>{status.enabled
          ? 'Mỗi lần đăng nhập, bạn cần nhập mã mới từ ứng dụng xác thực sau mật khẩu.'
          : 'Thiết lập mã thời gian trong ứng dụng xác thực. Tính năng chỉ được bật sau khi bạn xác minh mã từ ứng dụng.'}</p>
        {status.enabled && !setup && <div className="mfa-actions">
          <button className="admin-secondary-button" type="button" disabled={busy} onClick={() => setReplacePrompt((value) => !value)}>Thay ứng dụng xác thực</button>
        </div>}
        {status.enabled && replacePrompt && !setup && <form className="mfa-form" onSubmit={beginSetupFromButton}>
          <h3>Xác minh lại để thay ứng dụng xác thực</h3>
          <ReauthFields enabled password={replacePassword} setPassword={setReplacePassword} code={replaceCode} setCode={setReplaceCode} />
          <button className="admin-primary-button" type="submit" disabled={busy || !replacePassword || !replaceCode}>{busy ? 'Đang bắt đầu…' : 'Tiếp tục thay thế'}</button>
          <button className="admin-secondary-button" type="button" disabled={busy} onClick={() => setReplacePrompt(false)}>Hủy</button>
        </form>}
        {!status.enabled && !setup && <form className="mfa-form" onSubmit={beginSetup}>
          <ReauthFields enabled={false} password={password} setPassword={setPassword} code={code} setCode={setCode} />
          <button className="admin-primary-button" type="submit" disabled={busy || !password}>{busy ? 'Đang bắt đầu…' : 'Thiết lập ứng dụng xác thực'}</button>
        </form>}
        {setup && <div className="mfa-enrollment">
          <p>Bật ngày giờ tự động trên thiết bị có ứng dụng xác thực. Quét mã này hoặc nhập khóa thủ công bên dưới, rồi xác minh bằng mã mới.</p>
          <img className="mfa-qr" src={setup.qrCodeDataUrl} alt="Mã QR cài đặt ứng dụng xác thực" />
          <label htmlFor="mfa-manual-secret">Khóa thủ công</label>
          <code id="mfa-manual-secret" className="mfa-secret">{setup.secret}</code>
          <form className="mfa-form" onSubmit={confirmSetup}>
            <CodeField code={verifyCode} setCode={setVerifyCode} label="Mã từ ứng dụng xác thực" />
            <button className="admin-primary-button" type="submit" disabled={busy || !/^\d{6}$/.test(verifyCode)}>{busy ? 'Đang xác minh…' : 'Xác minh và bật'}</button>
            <button className="admin-secondary-button" type="button" disabled={busy} onClick={() => { setSetup(null); setVerifyCode(''); setNotice(''); }}>Hủy cài đặt</button>
          </form>
        </div>}
        {status.enabled && <form className="mfa-form mfa-danger-form" onSubmit={disable}>
          <h3>Tắt xác thực đa yếu tố</h3>
          <ReauthFields enabled password={disablePassword} setPassword={setDisablePassword} code={disableCode} setCode={setDisableCode} />
          <button className="admin-danger-button" type="submit" disabled={busy || !disablePassword || !disableCode}>{busy ? 'Đang tắt…' : 'Tắt MFA'}</button>
        </form>}
      </section>
      {status.enabled && <section className="admin-panel mfa-panel">
        <div className="admin-panel-heading"><div><p className="eyebrow">KHÔI PHỤC TÀI KHOẢN</p><h2>Mã khôi phục</h2></div></div>
        <p>Mỗi mã khôi phục chỉ dùng được một lần. Khi tạo bộ mới, toàn bộ mã cũ sẽ mất hiệu lực.</p>
        <form className="mfa-form" onSubmit={(event) => { event.preventDefault(); void replaceRecoveryCodes(); }}>
          <ReauthFields enabled password={recoveryPassword} setPassword={setRecoveryPassword} code={recoveryCode} setCode={setRecoveryCode} />
          <button className="admin-secondary-button" type="submit" disabled={busy || !recoveryPassword || !recoveryCode}>{busy ? 'Đang tạo…' : 'Tạo bộ mã khôi phục mới'}</button>
        </form>
      </section>}
      {recoveryCodes && <section className="admin-panel mfa-panel mfa-recovery-panel" aria-labelledby="mfa-recovery-title">
        <div className="admin-panel-heading"><div><p className="eyebrow">LƯU NGAY</p><h2 id="mfa-recovery-title">Mã khôi phục của bạn</h2></div></div>
        <p>Các mã này chỉ hiển thị một lần. Hãy lưu riêng khỏi mật khẩu ở nơi an toàn.</p>
        <ol className="mfa-recovery-list">{recoveryCodes.map((value) => <li key={value}><code>{value}</code></li>)}</ol>
        <button className="admin-secondary-button" type="button" onClick={copyCodes}>Sao chép mã</button>
        <button className="admin-secondary-button" type="button" onClick={() => setRecoveryCodes(null)}>Đóng mã</button>
      </section>}
    </>}
  </section>;

  async function beginSetupFromButton(event) {
    event?.preventDefault();
    const result = await perform('/api/auth/mfa/setup', { password: replacePassword, code: replaceCode });
    if (result) {
      setSetup(result);
      setReplacePrompt(false);
      setReplacePassword('');
      setReplaceCode('');
      setRecoveryCodes(null);
      setVerifyCode('');
      setNotice('Hãy xác minh mã từ ứng dụng mới để thay ứng dụng hiện tại.');
    }
  }
}

function ReauthFields({ enabled, password, setPassword, code, setCode }) {
  const passwordId = React.useId();
  return <>
      <div className="form-field"><label htmlFor={passwordId}>Mật khẩu hiện tại</label><input id={passwordId} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
    {enabled && <CodeField code={code} setCode={setCode} label="Mã xác thực hoặc mã khôi phục hiện tại" />}
  </>;
}

function CodeField({ code, setCode, label }) {
  const id = React.useId();
  return <div className="form-field"><label htmlFor={id}>{label}</label><input id={id} type="text" inputMode="text" autoComplete="one-time-code" maxLength="40" value={code} onChange={(event) => setCode(event.target.value)} required /></div>;
}
