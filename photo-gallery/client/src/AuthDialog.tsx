import { useEffect, useRef, useState, type FormEvent } from "react";

export type GalleryUser = { id: string; username: string; displayName: string | null; bio: string | null; avatarUrl: string | null };

export function AuthDialog({ initialMode, onClose, onAuthenticated }: { initialMode: "login" | "register"; onClose: () => void; onAuthenticated: (user: GalleryUser, csrfToken: string) => void }) {
  const [mode, setMode] = useState(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus(); document.body.classList.add("dialog-open");
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const items = document.querySelectorAll<HTMLElement>(".auth-dialog button:not(:disabled), .auth-dialog input:not(:disabled)");
        const first = items[0]; const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); document.body.classList.remove("dialog-open"); previousFocus?.focus(); };
  }, [onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
      const result = await response.json() as { user?: GalleryUser; csrfToken?: string; error?: { message?: string } };
      if (!response.ok || !result.user || !result.csrfToken) throw new Error(result.error?.message ?? "Account request failed. Try again.");
      onAuthenticated(result.user, result.csrfToken);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Account request failed. Try again."); }
    finally { setBusy(false); }
  }

  return <div className="share-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="share-dialog auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-heading">
      <button ref={closeRef} className="icon-button" aria-label="Close sign in" onClick={onClose}><svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M3 3l12 12M15 3L3 15" stroke="currentColor" strokeWidth="1.5" /></svg></button>
      <p className="eyebrow">The shared wildlife board</p>
      <h2 id="auth-heading">{mode === "login" ? "Welcome back." : "Join the gallery."}</h2>
      <p>{mode === "login" ? "Sign in with your username and password." : "Create a username and password to contribute."}</p>
      <form onSubmit={(event) => void submit(event)}>
        <label>Username<input autoComplete="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" aria-describedby="username-requirement" value={username} onChange={(event) => setUsername(event.target.value)} /><small id="username-requirement" className="field-requirement">3–24 characters: letters, numbers, and underscores.</small></label>
        <label>Password<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} maxLength={128} aria-describedby="password-requirement" value={password} onChange={(event) => setPassword(event.target.value)} /><small id="password-requirement" className="field-requirement">8–128 characters.</small></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="solid-button" disabled={busy} type="submit">{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
      </form>
      <p className="auth-switch">{mode === "login" ? "New here?" : "Already have an account?"} <button className="text-button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "Create an account" : "Sign in"}</button></p>
      {mode === "register" && <p className="auth-footnote">Store your password safely; self-service recovery is not available yet.</p>}
    </section>
  </div>;
}
