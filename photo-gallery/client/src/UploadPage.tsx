import { useState, type FormEvent } from "react";

type PhotoDraft = {
  file: File;
  title: string;
  caption: string;
  category: string;
  story: string;
};

type UploadOutcome = {
  fileIndex: number;
  originalName: string;
  status: "succeeded" | "failed";
  error?: { code: string; message: string };
  photo?: { id: string; variants?: Array<{ width: number; url: string }> };
};

const emptyDraft = (file: File): PhotoDraft => ({
  file, title: "", caption: "", category: "", story: "",
});

export function UploadPage({ csrfToken, authenticated, onSignIn }: { csrfToken?: string; authenticated?: boolean; onSignIn?: () => void } = {}) {
  const [drafts, setDrafts] = useState<PhotoDraft[]>([]);
  const [outcomes, setOutcomes] = useState<UploadOutcome[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function selectFiles(files: FileList | null) {
    const chosen = Array.from(files ?? []);
    setOutcomes([]);
    if (chosen.length > 5) {
      setDrafts([]);
      setError("Choose no more than five photos per batch.");
      return;
    }
    setError("");
    setDrafts(chosen.map(emptyDraft));
  }

  function updateDraft(index: number, field: keyof Omit<PhotoDraft, "file">, value: string | boolean) {
    setDrafts((current) => current.map((draft, item) => item === index ? { ...draft, [field]: value } : draft));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setOutcomes([]);
    if (drafts.length === 0 || drafts.length > 5) {
      setError("Choose between one and five photos.");
      return;
    }
    const body = new FormData();
    drafts.forEach(({ file }) => body.append("files", file, file.name));
    body.append("metadata", JSON.stringify(drafts.map((draft) => ({
      title: draft.title,
      caption: draft.caption,
      category: draft.category,
      story: draft.story,
    }))));
    setBusy(true);
    try {
      const response = await fetch("/api/photos/batch", { method: "POST", body, headers: csrfToken ? { "x-csrf-token": csrfToken } : undefined });
      const payload = await response.json() as { error?: { message?: string }; results?: UploadOutcome[] };
      if (payload.results) setOutcomes(payload.results);
      else setError(payload.error?.message ?? "The upload request failed. Please try again.");
    } catch {
      setError("The server could not be reached. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="upload-panel" aria-labelledby="upload-heading">
      <div className="upload-heading-row">
        <div>
          <p className="eyebrow">Contribute</p>
          <h2 id="upload-heading">Add wildlife photos</h2>
        </div>
        <span className="batch-limit">1–5 photos per batch</span>
      </div>
      {authenticated === false ? <div className="upload-sign-in"><p>Sign in to add photographs to the shared board.</p><button className="submit-button" type="button" onClick={onSignIn}>Sign in to contribute</button></div> : <><label className="file-picker">
        <span>Choose JPEG or PNG files</span>
        <input aria-label="Choose photos" type="file" accept="image/jpeg,image/png" multiple onChange={(event) => selectFiles(event.currentTarget.files)} />
      </label>

      {error && <p className="form-error" role="alert">{error}</p>}

      <form onSubmit={submit}>
        {drafts.map((draft, index) => (
          <fieldset className="photo-draft" key={`${draft.file.name}-${index}`}>
            <legend>{draft.file.name} <span>({(draft.file.size / 1024 / 1024).toFixed(1)} MB)</span></legend>
            <div className="field-grid">
              <label>Title<input required value={draft.title} onChange={(event) => updateDraft(index, "title", event.target.value)} /></label>
              <label>Category<input value={draft.category} onChange={(event) => updateDraft(index, "category", event.target.value)} /></label>
              <label className="wide-field">Caption<textarea rows={2} value={draft.caption} onChange={(event) => updateDraft(index, "caption", event.target.value)} /></label>
              <label className="wide-field">Story / description<textarea rows={3} value={draft.story} onChange={(event) => updateDraft(index, "story", event.target.value)} /></label>
            </div>
          </fieldset>
        ))}
        {drafts.length > 0 && <button className="submit-button" type="submit" disabled={busy}>{busy ? "Uploading…" : `Upload ${drafts.length} ${drafts.length === 1 ? "photo" : "photos"}`}</button>}
      </form>

      {outcomes.length > 0 && (
        <div className="upload-results" aria-live="polite" aria-labelledby="results-heading">
          <h3 id="results-heading">Upload results</h3>
          <ul>{outcomes.map((outcome) => <li key={outcome.fileIndex}>
            <strong>{outcome.originalName}</strong>: {outcome.status === "succeeded" ? "Uploaded successfully." : outcome.error?.message ?? "Upload failed."}
          </li>)}</ul>
        </div>
      )}
      <p className="upload-note">Add a title and any details you would like to share. Title is required.</p></>}
    </section>
  );
}
