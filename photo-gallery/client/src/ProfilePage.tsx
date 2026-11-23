import { useEffect, useState, type FormEvent } from "react";
import type { GalleryUser } from "./AuthDialog.js";
import { ResponsiveImage } from "./ResponsiveImage.js";

type ProfilePhoto = { id: string; title: string; altText: string | null; category: string | null; photoYear: number | null; createdAt: string; variants: Array<{ width: number; height: number; url: string }> };
type ProfileData = { user: GalleryUser & { joinedAt: string; photoCount: number }; photos: ProfilePhoto[]; page: number; pages: number };

export function ProfilePage({ username }: { username: string }) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [authUser, setAuthUser] = useState<GalleryUser | null>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function load() {
    setError("");
    try {
      const [profileResponse, meResponse] = await Promise.all([fetch(`/api/users/${encodeURIComponent(username)}`), fetch("/api/auth/me")]);
      if (!profileResponse.ok) throw new Error(profileResponse.status === 404 ? "This profile could not be found." : "The profile is temporarily unavailable.");
      const data = await profileResponse.json() as ProfileData;
      const me = await meResponse.json() as { user: GalleryUser | null; csrfToken?: string };
      setProfile(data); setAuthUser(me.user); setCsrfToken(me.csrfToken ?? "");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The profile is temporarily unavailable."); }
  }
  useEffect(() => { void load(); }, [username]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/users/me", { method: "PATCH", headers: { "content-type": "application/json", "x-csrf-token": csrfToken }, body: JSON.stringify({ displayName: form.get("displayName"), bio: form.get("bio"), avatarUrl: form.get("avatarUrl") || null }) });
      const result = await response.json() as { user?: GalleryUser; error?: { message?: string } };
      if (!response.ok || !result.user) throw new Error(result.error?.message ?? "Profile update failed.");
      setProfile((current) => current ? { ...current, user: { ...current.user, ...result.user! } } : current); setAuthUser(result.user); setEditing(false); setNotice("Profile updated.");
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Profile update failed."); }
    finally { setBusy(false); }
  }

  return <div className="profile-page"><a className="skip-link" href="#profile-content">Skip to content</a><header className="profile-header"><a className="brand-lockup" href="/"><span className="brand-mark"><svg viewBox="0 0 32 32" width="25" height="25" fill="currentColor" aria-hidden="true"><ellipse cx="6.5" cy="12.5" rx="3" ry="4" transform="rotate(-25 6.5 12.5)"/><ellipse cx="12.5" cy="7.5" rx="3" ry="4"/><ellipse cx="19.5" cy="7.5" rx="3" ry="4"/><ellipse cx="25.5" cy="12.5" rx="3" ry="4" transform="rotate(25 25.5 12.5)"/><path d="M16 14c-3 0-4.5 3-7 5.5-2.5 2.6-2 6.5 1.5 6.5 2 0 3.6-1.2 5.5-1.2s3.5 1.2 5.5 1.2c3.5 0 4-3.9 1.5-6.5C20.5 17 19 14 16 14Z"/></svg></span><span><strong>FIELD NOTES</strong><small>Wildlife Photography</small></span></a><a className="outline-button" href="/">← Explore the gallery</a></header><main id="profile-content">{error ? <section className="profile-error"><p className="eyebrow">Member profile</p><h1>{error}</h1><a className="solid-button" href="/">Return to the gallery</a></section> : !profile ? <div className="profile-loading" role="status">Loading profile…</div> : <><section className="profile-hero">{profile.user.avatarUrl ? <img className="profile-avatar" src={profile.user.avatarUrl} alt="" /> : <div className="profile-avatar profile-avatar-placeholder" aria-hidden="true">{profile.user.username.slice(0, 1).toUpperCase()}</div>}<div><p className="eyebrow">Gallery contributor · Joined {new Date(profile.user.joinedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p><h1>{profile.user.displayName || `@${profile.user.username}`}</h1><p className="profile-handle">@{profile.user.username} <span>·</span> {profile.user.photoCount} {profile.user.photoCount === 1 ? "photograph" : "photographs"}</p>{profile.user.bio && <p className="profile-bio">{profile.user.bio}</p>}</div>{authUser?.id === profile.user.id && <button className="outline-button profile-edit-trigger" onClick={() => setEditing(!editing)}>{editing ? "Close editor" : "Edit profile"}</button>}</section>
      {editing && <form className="profile-edit-form" onSubmit={(event) => void save(event)}><label>Display name<input name="displayName" maxLength={60} defaultValue={profile.user.displayName ?? ""} /></label><label>Short bio<textarea name="bio" maxLength={280} rows={3} defaultValue={profile.user.bio ?? ""} /></label><label>Avatar image URL (HTTPS)<input name="avatarUrl" type="url" defaultValue={profile.user.avatarUrl ?? ""} /></label><button className="solid-button" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>{notice && <p role="status">{notice}</p>}</form>}{!editing && notice && <p className="profile-notice" role="status">{notice}</p>}
      <section className="profile-photos"><div className="profile-section-title"><div><p className="eyebrow">From this photographer</p><h2>Photographs <em>in the wild.</em></h2></div><span>{profile.user.photoCount} total</span></div>{profile.photos.length ? <div className="profile-grid">{profile.photos.map((photo) => <a className="profile-photo" href={`/?photo=${encodeURIComponent(photo.id)}`} key={photo.id} aria-label={`View ${photo.title}`}><ResponsiveImage variants={photo.variants} alt={photo.altText ?? photo.title} sizes="(max-width: 640px) 100vw, (max-width: 1000px) 50vw, 33vw" /><span><strong>{photo.title}</strong><small>{photo.category ?? "Wildlife"} · {photo.photoYear ?? new Date(photo.createdAt).getUTCFullYear()}</small></span></a>)}</div> : <div className="profile-empty"><p>This photographer hasn’t added a photo yet.</p><a href="/#contribute">Contribute a photograph →</a></div>}</section></>}</main><footer className="site-footer"><div className="footer-bottom"><span>© 2026 FIELD NOTES</span><a href="/">Back to the shared board ↑</a></div></footer></div>;
}
