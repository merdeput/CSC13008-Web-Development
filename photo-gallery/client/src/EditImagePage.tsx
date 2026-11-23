import { useEffect, useRef, useState } from "react";
import type { GalleryUser } from "./AuthDialog.js";

type Photo = { id: string; title: string };
type EditInfo = { id: string; currentVersion: number; width: number; height: number; currentEdit: { crop: Crop; rotation: 0 | 90 | 180 | 270; flipX: boolean; flipY: boolean } | null };
type Crop = { left: number; top: number; width: number; height: number };

export function EditImagePage({ photoId }: { photoId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [info, setInfo] = useState<EditInfo | null>(null);
  const [csrf, setCsrf] = useState("");
  const [crop, setCrop] = useState<Crop>({ left: 0, top: 0, width: 1, height: 1 });
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sourceReady, setSourceReady] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const [history, setHistory] = useState<Array<{ crop: Crop; rotation: 0 | 90 | 180 | 270; flipX: boolean; flipY: boolean }>>([]);
  const editStateRef = useRef({ crop, rotation, flipX, flipY }); editStateRef.current = { crop, rotation, flipX, flipY };
  const infoRef = useRef<EditInfo | null>(null); infoRef.current = info;

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch(`/api/photos/${photoId}`), fetch(`/api/photos/${photoId}/edit`), fetch("/api/auth/me")]).then(async ([p, i, u]) => {
      if (!p.ok || !i.ok || !u.ok) throw new Error("Sign in as the photo owner to edit this image.");
      const [photoData, infoData, userData] = await Promise.all([p.json() as Promise<Photo>, i.json() as Promise<EditInfo>, u.json() as Promise<{ user: GalleryUser | null; csrfToken?: string }>]);
      if (!userData.user) throw new Error("Sign in as the photo owner to edit this image.");
      if (cancelled) return;
      setPhoto(photoData);
      setInfo(infoData);
      if (infoData.currentEdit) {
        const saved = infoData.currentEdit;
        const width = Math.max(1, infoData.width);
        const height = Math.max(1, infoData.height);
        setCrop({ left: saved.crop.left / width, top: saved.crop.top / height, width: saved.crop.width / width, height: saved.crop.height / height });
        setRotation(saved.rotation);
        setFlipX(saved.flipX);
        setFlipY(saved.flipY);
      }
      setCsrf(userData.csrfToken ?? "");
      const image = new Image();
      image.onload = () => {
        if (cancelled) return;
        imageRef.current = image;
        setSourceReady(true);
      };
      image.onerror = () => { if (!cancelled) setSourceError("The private image preview failed to load. Refresh the page and try again."); };
      image.src = `/api/photos/${photoId}/edit/source`;
    }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "The editor could not be opened."); });
    return () => { cancelled = true; };
  }, [photoId]);

  useEffect(() => { if (sourceReady) draw(); }, [sourceReady, info, crop, rotation, flipX, flipY]);

  function draw(next = editStateRef.current) {
    const image = imageRef.current; const canvas = canvasRef.current; const dimensions = infoRef.current; if (!image || !canvas || !dimensions || !image.naturalWidth || !image.naturalHeight) return;
    const sx = Math.round(next.crop.left * dimensions.width); const sy = Math.round(next.crop.top * dimensions.height);
    const sw = Math.max(1, Math.round(next.crop.width * dimensions.width)); const sh = Math.max(1, Math.round(next.crop.height * dimensions.height));
    const quarterTurn = next.rotation === 90 || next.rotation === 270;
    canvas.width = quarterTurn ? sh : sw; canvas.height = quarterTurn ? sw : sh;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(next.rotation * Math.PI / 180); ctx.scale(next.flipX ? -1 : 1, next.flipY ? -1 : 1);
    ctx.drawImage(image, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
  }
  function change(change: Partial<{ crop: Crop; rotation: 0 | 90 | 180 | 270; flipX: boolean; flipY: boolean }>) {
    const state = { crop, rotation, flipX, flipY }; setHistory((entries) => [...entries.slice(-19), state]);
    const next = { ...state, ...change }; if (change.crop) setCrop(change.crop); if (change.rotation !== undefined) setRotation(change.rotation); if (change.flipX !== undefined) setFlipX(change.flipX); if (change.flipY !== undefined) setFlipY(change.flipY); draw(next);
  }
  function undo() {
    const previous = history.at(-1); if (!previous) return;
    setHistory((items) => items.slice(0, -1)); setCrop(previous.crop); setRotation(previous.rotation); setFlipX(previous.flipX); setFlipY(previous.flipY); draw(previous);
  }
  function reset() { change({ crop: { left: 0, top: 0, width: 1, height: 1 }, rotation: 0, flipX: false, flipY: false }); }
  async function save(restore = false) {
    if (!info) return;
    setBusy(true); setError("");
    try {
      const url = `/api/photos/${photoId}/${restore ? "restore" : "edit"}`;
      const body = { crop: { left: Math.round(crop.left * info.width), top: Math.round(crop.top * info.height), width: Math.round(crop.width * info.width), height: Math.round(crop.height * info.height) }, rotation, flipX, flipY };
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify(restore ? {} : body) });
      const result = await response.json() as { error?: { message?: string }; variants?: unknown[]; version?: number; restored?: boolean };
      if (!response.ok || (!restore && !result.variants) || (restore && !result.restored)) throw new Error(result.error?.message ?? "Could not save this edit.");
      setInfo((current) => current ? { ...current, currentVersion: result.version ?? current.currentVersion + 1, currentEdit: restore ? null : body } : current);
      if (restore) { setCrop({ left: 0, top: 0, width: 1, height: 1 }); setRotation(0); setFlipX(false); setFlipY(false); }
      setHistory([]); window.history.replaceState({}, "", `/photos/${photoId}/edit?saved=1`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save this edit."); }
    finally { setBusy(false); }
  }

  return <main className="image-editor-page"><header className="editor-header"><a href="/" className="outline-button">← Gallery</a><div><p className="eyebrow">Version {info?.currentVersion ?? "—"}</p><h1>Edit Your Image</h1><p>{photo?.title}</p></div><button className="solid-button" disabled={busy || !info || (crop.left === 0 && crop.top === 0 && crop.width === 1 && crop.height === 1 && rotation === 0 && !flipX && !flipY)} onClick={() => void save()}>{busy ? "Saving…" : "Save changes"}</button></header>
    {error && <p className="editor-error" role="alert">{error}</p>}
    <section className="editor-workspace"><div className="editor-canvas-wrap">{info && <canvas ref={canvasRef} aria-label="Live image edit preview" />}{!sourceReady && !error && <p role="status">{sourceError || "Loading image preview…"}</p>}</div><aside className="editor-tools"><h2>Editing tools</h2><p>Each save is created from the private original.</p><div className="editor-tool-group"><h3>Crop</h3>{([['left','Left',crop.left],['top','Top',crop.top],['width','Width',crop.width],['height','Height',crop.height]] as const).map(([field,label,value]) => <label key={field}>{label}<input aria-label={`Crop ${label.toLowerCase()}`} type="range" min={field === "width" || field === "height" ? .1 : 0} max={1} step={.01} value={value} onChange={(event) => { const n=Number(event.target.value); const next={...crop,[field]:n}; if(next.left+next.width>1) next.width=1-next.left; if(next.top+next.height>1) next.height=1-next.top; change({crop:next}); }} /></label>)}</div><div className="editor-tool-group"><h3>Rotate</h3><div className="editor-button-row"><button className="outline-button" onClick={() => change({rotation:((rotation+270)%360) as 0|90|180|270})}>↶ 90°</button><button className="outline-button" onClick={() => change({rotation:((rotation+90)%360) as 0|90|180|270})}>↷ 90°</button></div></div><div className="editor-button-row"><button className="outline-button" aria-pressed={flipX} onClick={() => change({flipX:!flipX})}>Flip horizontal</button><button className="outline-button" aria-pressed={flipY} onClick={() => change({flipY:!flipY})}>Flip vertical</button></div><div className="editor-button-row"><button className="outline-button" disabled={!history.length} onClick={undo}>Undo</button><button className="outline-button" onClick={reset}>Reset edits</button></div><button className="text-button" disabled={busy} onClick={() => { if(window.confirm("Restore the original display version? Your original file remains unchanged.")) void save(true); }}>Restore original</button><small>Published variants are sanitized and do not retain EXIF or GPS data.</small></aside></section>
  </main>;
}
