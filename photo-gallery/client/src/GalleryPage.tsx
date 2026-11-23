// Editorial browsing experience for the public wildlife collection.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { UploadPage } from "./UploadPage.js";
import { AuthDialog, type GalleryUser } from "./AuthDialog.js";
import { ResponsiveImage } from "./ResponsiveImage.js";

type GalleryPhoto = { id: string; title: string; caption: string | null; altText: string | null; category: string | null; photographerCredit: string | null; locationName: string | null; locationContinent: string | null; locationRegion: string | null; locationCountry: string | null; competition: string | null; award: string | null; photoYear: number | null; speciesCommon: string | null; speciesLatin: string | null; story: string | null; createdAt: string; width: number; height: number; owner: { id: string; username: string; displayName: string | null; isSystem: boolean } | null; tags: Array<{ name: string; slug: string }>; variants: Array<{ width: number; height: number; url: string }> };
type Facets = { categories: string[]; tags: Array<{ name: string; slug: string; count: number }>; photographers: string[]; locations: Array<{ continent: string; region: string | null; country: string }>; years: number[]; competitions: string[]; awards: string[]; species: Array<{ common: string; latin: string | null }> };
const emptyFacets: Facets = { categories: [], tags: [], photographers: [], locations: [], years: [], competitions: [], awards: [], species: [] };
const readParams = () => new URLSearchParams(window.location.search);

export function GalleryPage() {
  const [params, setParams] = useState(readParams);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [facets, setFacets] = useState<Facets>(emptyFacets);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loadedPage, setLoadedPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [lightboxOrigin, setLightboxOrigin] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("gallery-theme") ?? "dark");
  const [cookieVisible, setCookieVisible] = useState(() => !localStorage.getItem("gallery-cookie-choice"));
  const [cookieSettingsOpen, setCookieSettingsOpen] = useState(false);
  const [analyticsAllowed, setAnalyticsAllowed] = useState(false);
  const [authUser, setAuthUser] = useState<GalleryUser | null>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [authDialog, setAuthDialog] = useState<"login" | "register" | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [deleteError, setDeleteError] = useState("");
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [facetSearch, setFacetSearch] = useState("");

  const lightboxCloseRef = useRef<HTMLButtonElement>(null);
  const closeDrawerRef = useRef<HTMLButtonElement>(null);
  const gridSectionRef = useRef<HTMLElement>(null);
  const heroImageRef = useRef<HTMLDivElement>(null);
  const previousCardRectsRef = useRef<Map<string, DOMRect> | null>(null);
  const lightboxDialogRef = useRef<HTMLElement>(null);
  const lightboxFrameRef = useRef<number | null>(null);
  const moreRequestRef = useRef<AbortController | null>(null);
  const updateParams = useCallback((update: (draft: URLSearchParams) => void, replace = false) => {
    const next = new URLSearchParams(window.location.search);
    update(next);
    const query = next.toString();
    window.history[replace ? "replaceState" : "pushState"]({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    setParams(new URLSearchParams(next));
  }, []);
  useEffect(() => { const onPop = () => { setParams(readParams()); setSearch(readParams().get("q") ?? ""); }; window.addEventListener("popstate", onPop); return () => window.removeEventListener("popstate", onPop); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("gallery-theme", theme); }, [theme]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", { signal: controller.signal }).then((response) => response.json() as Promise<{ user: GalleryUser | null; csrfToken?: string }>).then((result) => { setAuthUser(result.user); setCsrfToken(result.csrfToken ?? ""); }).catch(() => undefined);
    return () => controller.abort();
  }, []);
  useEffect(() => { const controller = new AbortController(); fetch("/api/filters", { signal: controller.signal }).then((response) => response.ok ? response.json() as Promise<Facets> : Promise.reject()).then(setFacets).catch(() => undefined); return () => controller.abort(); }, []);
  const queryString = params.toString();
  useEffect(() => {
    const hero = heroImageRef.current;
    if (!hero || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = hero.getBoundingClientRect();
        const offset = Math.max(-16, Math.min(16, (window.innerHeight - rect.top) * 0.025 - 12));
        hero.style.transform = `translate3d(0, ${offset}px, 0) scale(1.04)`;
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, []);
  useLayoutEffect(() => {
    const cards = gridSectionRef.current?.querySelectorAll<HTMLElement>(".photo-card[data-photo-id]");
    previousCardRectsRef.current = cards?.length
      ? new Map([...cards].map((card) => [card.dataset.photoId!, card.getBoundingClientRect()]))
      : null;
  }, [queryString]);
  useLayoutEffect(() => {
    const previous = previousCardRectsRef.current;
    if (loading || !previous || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cards = gridSectionRef.current?.querySelectorAll<HTMLElement>(".photo-card[data-photo-id]");
    cards?.forEach((card) => {
      const oldRect = previous.get(card.dataset.photoId ?? "");
      if (!oldRect) return;
      const nextRect = card.getBoundingClientRect();
      const dx = oldRect.left - nextRect.left;
      const dy = oldRect.top - nextRect.top;
      if (!dx && !dy) return;
      card.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(.985)` },
        { transform: "translate(0, 0) scale(1)" },
      ], { duration: 360, easing: "ease-out" });
    });
    previousCardRectsRef.current = null;
  }, [photos, loading]);
  useLayoutEffect(() => {
    if (!lightbox) return;
    const dialog = lightboxDialogRef.current;
    if (!dialog) return;
    dialog.classList.remove("lightbox-entered");
    lightboxFrameRef.current = requestAnimationFrame(() => dialog.classList.add("lightbox-entered"));
    return () => { if (lightboxFrameRef.current !== null) cancelAnimationFrame(lightboxFrameRef.current); };
  }, [lightbox]);
  useEffect(() => {
    if (!lightboxOrigin) return;
    const timer = window.setTimeout(() => setLightboxOrigin(null), 450);
    return () => window.clearTimeout(timer);
  }, [lightboxOrigin]);
  useEffect(() => {
    const controller = new AbortController(); moreRequestRef.current?.abort(); setLoading(true); setLoadingMore(false); setLoadMoreError(""); setError("");
    fetch(`/api/photos${queryString ? `?${queryString}` : ""}`, { signal: controller.signal }).then(async (response) => { if (!response.ok) throw new Error("The gallery could not be loaded. Please try again."); return response.json() as Promise<{ photos: GalleryPhoto[]; total: number; pages: number; page: number }>; }).then((result) => { setPhotos(result.photos); setTotal(result.total); setPages(Math.max(1, result.pages)); setLoadedPage(result.page); }).catch((reason: unknown) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : "The gallery could not be loaded."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); moreRequestRef.current?.abort(); };
  }, [queryString, refreshKey]);
  useEffect(() => {
    const shared = params.get("photos");
    if (shared) setSelected(shared.split(",").filter(Boolean));
    const photoId = params.get("photo");
    if (photoId && photos.some((photo) => photo.id === photoId)) setLightbox(photoId);
  }, [params, photos]);
  const activeCount = [...params.keys()].filter((key) => key !== "page" && key !== "sort").length;
  const currentIndex = photos.findIndex((photo) => photo.id === lightbox);
  const current = currentIndex >= 0 ? photos[currentIndex] : null;
  const selectedIds = useMemo(() => selected.join(","), [selected]);
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightbox(null);
      if (event.key === "ArrowLeft" && currentIndex > 0) setLightbox(photos[currentIndex - 1].id);
      if (event.key === "ArrowRight" && currentIndex < photos.length - 1) setLightbox(photos[currentIndex + 1].id);
      if (event.key === "Tab") { const items = document.querySelectorAll<HTMLElement>(".lightbox-dialog button, .lightbox-dialog a"); const first = items[0]; const last = items[items.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
    };
    document.addEventListener("keydown", onKey); document.body.classList.add("dialog-open"); lightboxCloseRef.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.classList.remove("dialog-open"); };
  }, [lightbox, currentIndex, photos]);
  useEffect(() => { if (!drawerOpen) return; const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setDrawerOpen(false); }; document.addEventListener("keydown", onKey); document.body.classList.add("dialog-open"); closeDrawerRef.current?.focus(); return () => { document.removeEventListener("keydown", onKey); document.body.classList.remove("dialog-open"); }; }, [drawerOpen]);
  function toggleParam(key: string, value: string) { updateParams((draft) => { const old = draft.getAll(key); draft.delete(key); if (!old.includes(value)) [...old, value].forEach((item) => draft.append(key, item)); draft.delete("page"); }); }
  function clearFilters() { setSearch(""); updateParams((draft) => { for (const key of [...draft.keys()]) draft.delete(key); }); }
  function setSearchQuery(value: string) { setSearch(value); updateParams((draft) => { draft.delete("q"); if (value.trim()) draft.set("q", value.trim()); draft.delete("page"); }, true); }
  function toggleSelected(id: string) { setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]); }
  async function loadMorePhotos() {
    if (loadingMore || loadedPage >= pages) return;
    const controller = new AbortController();
    moreRequestRef.current = controller;
    setLoadingMore(true); setLoadMoreError("");
    const nextParams = new URLSearchParams(queryString);
    nextParams.set("page", String(loadedPage + 1));
    try {
      const response = await fetch(`/api/photos?${nextParams}`, { signal: controller.signal });
      if (!response.ok) throw new Error("More photographs could not be loaded. Please try again.");
      const result = await response.json() as { photos: GalleryPhoto[]; page: number };
      setPhotos((existing) => [...existing, ...result.photos.filter((photo) => !existing.some((item) => item.id === photo.id))]);
      setLoadedPage(result.page);
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setLoadMoreError(reason instanceof Error ? reason.message : "More photographs could not be loaded.");
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }
  async function copyLink(link = window.location.href) { try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); } }
  function shareUrl() { const url = new URL(window.location.href); url.search = ""; url.searchParams.set("photos", selectedIds); return url.toString(); }
  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST", headers: { "x-csrf-token": csrfToken } });
    setAuthUser(null); setCsrfToken("");
  }
  async function deletePhoto() {
    if (!current || !window.confirm(`Delete “${current.title}” from the shared board?`)) return;
    setDeleteError("");
    try {
      const response = await fetch(`/api/photos/${current.id}`, { method: "DELETE", headers: { "x-csrf-token": csrfToken } });
      if (!response.ok) throw new Error("The photo could not be deleted. Refresh your session and try again.");
      setLightbox(null); setRefreshKey((key) => key + 1);
    } catch (reason) { setDeleteError(reason instanceof Error ? reason.message : "The photo could not be deleted."); }
  }

  return <div className="gallery-app" id="top">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="site-header"><div className="institution-bar"><a href="#top" className="brand-lockup"><span className="brand-mark"><svg viewBox="0 0 32 32" width="25" height="25" fill="currentColor" aria-hidden="true"><ellipse cx="6.5" cy="12.5" rx="3" ry="4" transform="rotate(-25 6.5 12.5)"/><ellipse cx="12.5" cy="7.5" rx="3" ry="4"/><ellipse cx="19.5" cy="7.5" rx="3" ry="4"/><ellipse cx="25.5" cy="12.5" rx="3" ry="4" transform="rotate(25 25.5 12.5)"/><path d="M16 14c-3 0-4.5 3-7 5.5-2.5 2.6-2 6.5 1.5 6.5 2 0 3.6-1.2 5.5-1.2s3.5 1.2 5.5 1.2c3.5 0 4-3.9 1.5-6.5C20.5 17 19 14 16 14Z"/></svg></span><span><strong>FIELD NOTES</strong><small>Wildlife Photography</small></span></a><div className="utility-links"><button className="theme-toggle" title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>{theme === "dark" ? "☼" : "◐"}</button></div></div><div className="main-nav-wrap"><button className="menu-toggle" aria-expanded={menuOpen} aria-controls="main-nav" onClick={() => setMenuOpen(!menuOpen)}><span></span><span></span><span></span><span className="sr-only">Menu</span></button><nav id="main-nav" className={menuOpen ? "main-nav is-open" : "main-nav"} aria-label="Main navigation"><a href="#exhibition">The exhibition</a><a className="is-active" href="#main-content" aria-current="page">Explore the gallery</a><a href="#contribute">Contribute</a></nav><div className="nav-account">{authUser ? <><a href={`/u/${encodeURIComponent(authUser.username)}`} className="account-link">@{authUser.username}</a><button className="text-button" onClick={() => void signOut()}>Sign out</button></> : <><button className="text-button" onClick={() => setAuthDialog("login")}>Sign in</button><button className="solid-button" onClick={() => setAuthDialog("register")}>Join</button></>}</div></div></header>
    <main id="main-content">
      <section className="gallery-intro" id="exhibition"><div ref={heroImageRef} className="cat-hero-image" role="img" aria-label="Black-footed cat resting in its habitat" /><div className="cat-hero-copy"><svg className="whiskers" viewBox="0 0 160 36" fill="none" aria-hidden="true"><path d="M2 3L68 15M2 18H66M2 33L68 21M158 3L92 15M158 18H94M158 33L92 21" stroke="currentColor" strokeWidth="1.5"/><path d="M75 16Q80 23 85 16" stroke="currentColor" strokeWidth="2"/></svg><h1>Explore the<br /><em>gallery</em></h1><p className="intro-copy">A celebration of the wild, seen differently. Every image is judged for its artistic composition, technical innovation and truthful interpretation of nature.</p></div><a className="hero-credit" href="https://commons.wikimedia.org/wiki/File:Blackfooted1.jpg">Black-footed cat / Zbyszko / CC BY-SA 3.0</a></section>
      <section className="gallery-controls" aria-label="Gallery controls"><button className="outline-button filter-trigger" onClick={() => setDrawerOpen(true)}>☷ &nbsp;Filters {activeCount > 0 && <b className="count-badge">{activeCount}</b>}</button><p className="result-count" aria-live="polite">{loading ? "Finding photographs…" : <><strong>{total.toLocaleString()}</strong> photographs</>}</p><div className="controls-right"><button className={selectMode ? "outline-button select-toggle active" : "outline-button select-toggle"} aria-pressed={selectMode} onClick={() => { setSelectMode(!selectMode); setSelected([]); }}>{selectMode ? "Done selecting" : "Select photos"}</button><button className="solid-button" title={!selected.length ? "Select photos to share" : "Share your selected photos"} disabled={!selected.length} onClick={() => { setShareOpen(true); setCopied(false); }}>Share your set ↗</button></div></section>
      <div className="quick-search"><span aria-hidden="true">⌕</span><label className="sr-only" htmlFor="gallery-search">Search photos</label><input id="gallery-search" value={search} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search species, place, photographer…" /></div>
      {activeCount > 0 && <div className="active-chips" aria-label="Active filters">{[...params.entries()].map(([key, value], index) => <button className="filter-chip" style={{ "--chip-index": index } as React.CSSProperties} key={`${key}-${value}-${index}`} onClick={() => toggleParam(key, value)}>{key === "tags" ? facets.tags.find((tag) => tag.slug === value)?.name ?? value : value}<span aria-hidden="true">×</span></button>)}<button className="clear-link" onClick={clearFilters}>Clear all</button></div>}
      <section ref={gridSectionRef} className="photo-grid-section" aria-label="Wildlife photographs">
        {error && <div className="gallery-error" role="alert"><p>{error}</p><button className="outline-button" onClick={() => updateParams(() => {}, true)}>Try again</button></div>}
        {loading && <div className="photo-grid" aria-label="Loading photographs">{Array.from({ length: 8 }, (_, index) => <div className={`photo-skeleton skeleton-${index % 4}`} key={index}></div>)}</div>}
        {!loading && !error && photos.length === 0 && <div className="empty-state"><span className="empty-orbit" aria-hidden="true">✳</span><p className="eyebrow">A quiet moment</p><h2>No photographs<br />match these filters.</h2><p>Try broadening your search, or clear your filters to explore the collection.</p><button className="solid-button" onClick={clearFilters}>Clear filters</button><a className="empty-upload-link" href="#contribute">Or add the first photograph →</a></div>}
        {!loading && !error && photos.length > 0 && <div className={`photo-grid ${selectMode ? "selection-mode" : ""}`}>{photos.map((photo, index) => <article data-photo-id={photo.id} className={`photo-card ${selected.includes(photo.id) ? "is-selected" : ""}`} key={photo.id} ><button className="photo-open" onClick={(event) => { if (selectMode) { toggleSelected(photo.id); return; } const rect = event.currentTarget.getBoundingClientRect(); setLightboxOrigin({ x: rect.left, y: rect.top, width: rect.width, height: rect.height }); setLightbox(photo.id); }} aria-label={`${selectMode ? (selected.includes(photo.id) ? "Deselect" : "Select") : "View details for"} ${photo.title}`}><ResponsiveImage variants={photo.variants} alt={photo.altText ?? photo.title} sizes="(max-width: 640px) 100vw, (max-width: 1000px) 50vw, 33vw" loading={index < 4 ? "eager" : "lazy"} /> <span className="photo-hover"><span className="hover-plus">{selected.includes(photo.id) ? "✓" : selectMode ? "+" : "↗"}</span><span><strong>{photo.title}</strong><small>{photo.photographerCredit ?? "Photographer uncredited"}</small></span>{photo.award && <span className="photo-award">{photo.award}</span>}<span className="photo-category">{photo.category ?? "WILDLIFE"}</span></span></button>{selectMode && <button className="selection-check" onClick={() => toggleSelected(photo.id)} aria-label={`${selected.includes(photo.id) ? "Remove" : "Add"} ${photo.title} ${selected.includes(photo.id) ? "from" : "to"} selection`}>{selected.includes(photo.id) ? "✓" : ""}</button>}<div className="card-caption"><span>{photo.category ?? "Wildlife"}</span>{photo.owner && !photo.owner.isSystem ? <a href={`/u/${encodeURIComponent(photo.owner.username)}`}>@{photo.owner.username}</a> : <span>Archive</span>}<span>{photo.photoYear ?? new Date(photo.createdAt).getUTCFullYear()}</span></div></article>)}</div>}
        {!loading && !error && photos.length > 0 && <div className="pagination"><span>Showing {photos.length} of {total} photographs</span>{loadMoreError && <span role="alert">{loadMoreError}</span>}{loadedPage < pages && <button className="outline-button" disabled={loadingMore} onClick={() => void loadMorePhotos()}>{loadingMore ? "Loading photographs…" : "Load more photographs"}</button>}</div>}
      </section>
      {selectMode && selected.length > 0 && <div className="selection-bar" role="status"><strong>Selected {selected.length} {selected.length === 1 ? "photo" : "photos"}</strong><button onClick={() => { setShareOpen(true); setCopied(false); }}>Share ↗</button><button onClick={() => setSelected([])}>Clear</button><button aria-label="Close selection mode" onClick={() => { setSelected([]); setSelectMode(false); }}>×</button></div>}
      <section className="contribute-section" id="contribute"><div className="contribute-intro"><h2>Share what<br />you <em>see.</em></h2><p>Every perspective helps us look closer. Add your photograph to the gallery.</p></div><UploadPage authenticated={Boolean(authUser)} csrfToken={csrfToken} onSignIn={() => setAuthDialog("login")} /></section>
    </main>
    <footer className="site-footer" id="footer"><div className="footer-top"><a href="#top" className="brand-lockup"><span className="brand-mark"><svg viewBox="0 0 32 32" width="25" height="25" fill="currentColor" aria-hidden="true"><ellipse cx="6.5" cy="12.5" rx="3" ry="4" transform="rotate(-25 6.5 12.5)"/><ellipse cx="12.5" cy="7.5" rx="3" ry="4"/><ellipse cx="19.5" cy="7.5" rx="3" ry="4"/><ellipse cx="25.5" cy="12.5" rx="3" ry="4" transform="rotate(25 25.5 12.5)"/><path d="M16 14c-3 0-4.5 3-7 5.5-2.5 2.6-2 6.5 1.5 6.5 2 0 3.6-1.2 5.5-1.2s3.5 1.2 5.5 1.2c3.5 0 4-3.9 1.5-6.5C20.5 17 19 14 16 14Z"/></svg></span><span><strong>FIELD NOTES</strong><small>Wildlife Photography</small></span></a><p>Made for the love of the living world.</p></div><div className="footer-bottom"><span>© 2026 FIELD NOTES · ALL RIGHTS RESERVED</span><span><button onClick={() => { setCookieVisible(true); setCookieSettingsOpen(true); }}>Cookie preferences</button></span><a href="#top">Back to top ↑</a></div></footer>
    {cookieVisible && <aside className="cookie-banner" aria-label="Cookie preferences"><span><strong>A note about cookies.</strong> We use essential cookies to make this gallery work.</span><button className="text-button" onClick={() => setCookieSettingsOpen(true)}>Manage my preferences</button><button className="solid-button" onClick={() => { localStorage.setItem("gallery-cookie-choice", "accepted"); setCookieVisible(false); }}>Yes, accept all</button></aside>}
    {cookieSettingsOpen && <div className="share-backdrop"><section className="share-dialog" role="dialog" aria-modal="true" aria-labelledby="cookie-heading"><button className="icon-button" aria-label="Close preferences" onClick={() => setCookieSettingsOpen(false)}>×</button><p className="eyebrow">Your privacy</p><h2 id="cookie-heading">Cookie preferences</h2><label className="cookie-option"><span><strong>Essential</strong><small>Needed for the gallery and saved preferences.</small></span><input type="checkbox" checked disabled aria-label="Essential cookies always active" /></label><label className="cookie-option"><span><strong>Analytics</strong><small>Help us understand which collections visitors enjoy.</small></span><input type="checkbox" checked={analyticsAllowed} onChange={(event) => setAnalyticsAllowed(event.target.checked)} /></label><button className="solid-button" onClick={() => { localStorage.setItem("gallery-cookie-choice", analyticsAllowed ? "analytics" : "essential"); setCookieVisible(false); setCookieSettingsOpen(false); }}>Save my preferences</button></section></div>}
    {drawerOpen && <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawerOpen(false); }}><aside className="filter-drawer" role="dialog" aria-modal="true" aria-labelledby="filter-heading"><header><div><p className="eyebrow">Refine the collection</p><h2 id="filter-heading">Filters</h2></div><button ref={closeDrawerRef} className="icon-button" aria-label="Close filters" onClick={() => setDrawerOpen(false)}>×</button></header><div className="drawer-content">
      <details open><summary>Dates <span>{facets.years.length || 1}</span></summary><div className="filter-options">{(facets.years.length ? facets.years : [new Date().getFullYear()]).map((year, index) => <label key={year}><input type="checkbox" checked={params.getAll("year").includes(String(year))} onChange={() => toggleParam("year", String(year))} /><span>{index === 0 ? `Current · ${year}` : year}</span></label>)}</div></details>
      <details open><summary>Categories <span>{facets.categories.length}</span></summary><div className="filter-options">{(facets.categories.length ? facets.categories : ["Animal Portraits", "Animals in their Environment", "Behaviour: Birds", "Behaviour: Mammals", "Behaviour: Amphibians & Reptiles", "Behaviour: Invertebrates", "Natural Artistry", "Oceans", "Photojournalism", "Plants and Fungi", "Under Water", "Urban Wildlife", "Wetlands", "People’s Choice", "10 and under", "11–14", "15–17"]).map((category) => <label key={category}><input type="checkbox" checked={params.getAll("category").includes(category)} onChange={() => toggleParam("category", category)} /><span>{category}</span></label>)}</div></details>
      <details><summary>Competition <span>{facets.competitions.length}</span></summary><div className="filter-options">{(facets.competitions.length ? facets.competitions : ["Adult", "Young"]).map((item) => <label key={item}><input type="checkbox" checked={params.getAll("competition").includes(item)} onChange={() => toggleParam("competition", item)} /><span>{item}</span></label>)}</div></details>
      <details><summary>Awards <span>{facets.awards.length}</span></summary><div className="filter-options">{(facets.awards.length ? facets.awards : ["Overall winner", "Young overall winner", "Category Winner", "Category Highly Commended", "Runner Up", "Impact Award Winner"]).map((item) => <label key={item}><input type="checkbox" checked={params.getAll("award").includes(item)} onChange={() => toggleParam("award", item)} /><span>{item}</span></label>)}</div></details>
      <details><summary>Locations <span>{facets.locations.length}</span></summary>{[...new Set(facets.locations.map((location) => location.continent))].sort().map((continent) => <details className="location-tree" key={continent}><summary>{continent}</summary><div className="filter-options"><label><input type="checkbox" checked={params.getAll("continent").includes(continent)} onChange={() => toggleParam("continent", continent)} /><span>All {continent}</span></label>{[...new Set(facets.locations.filter((location) => location.continent === continent).map((location) => location.region).filter((region): region is string => Boolean(region)))].sort().map((region) => <details className="location-tree" key={region}><summary>{region}</summary><div className="filter-options"><label><input type="checkbox" checked={params.getAll("region").includes(region)} onChange={() => toggleParam("region", region)} /><span>All {region}</span></label>{facets.locations.filter((location) => location.region === region).map((location) => <label key={location.country}><input type="checkbox" checked={params.getAll("country").includes(location.country)} onChange={() => toggleParam("country", location.country)} /><span>{location.country}</span></label>)}</div></details>)}</div></details>)}</details>
      <details><summary>Species <span>{facets.species.length + facets.tags.length}</span></summary><label className="drawer-search"><span className="sr-only">Search species and tags</span><input placeholder="Search species and tags" value={facetSearch} onChange={(event) => setFacetSearch(event.target.value)} /></label><div className="filter-options">{facets.species.filter((species) => `${species.common} ${species.latin ?? ""}`.toLowerCase().includes(facetSearch.toLowerCase())).map((species) => <label key={`${species.common}-${species.latin}`}><input type="checkbox" checked={params.getAll("species").includes(species.common)} onChange={() => toggleParam("species", species.common)} /><span>{species.common}<small><i>{species.latin}</i></small></span></label>)}{facets.tags.filter((tag) => tag.name.toLowerCase().includes(facetSearch.toLowerCase())).map((tag) => <label key={tag.slug}><input type="checkbox" checked={params.getAll("tags").includes(tag.slug)} onChange={() => toggleParam("tags", tag.slug)} /><span>{tag.name}<small>{tag.count}</small></span></label>)}</div></details>
      <details><summary>Photographers <span>{facets.photographers.length}</span></summary><label className="drawer-search"><span className="sr-only">Search photographers</span><input placeholder="Search photographers" value={facetSearch} onChange={(event) => setFacetSearch(event.target.value)} /></label><div className="filter-options">{facets.photographers.filter((name) => name.toLowerCase().includes(facetSearch.toLowerCase())).map((name) => <label key={name}><input type="checkbox" checked={params.getAll("photographer").includes(name)} onChange={() => toggleParam("photographer", name)} /><span>{name}</span></label>)}</div></details>
      </div><footer><button className="text-button" onClick={clearFilters}>Clear all</button><button className="solid-button" onClick={() => setDrawerOpen(false)}>Show {total} results</button></footer></aside></div>}
    {current && <div className="lightbox-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setLightbox(null); }}><section ref={lightboxDialogRef} className="lightbox-dialog" style={lightboxOrigin ? ({ "--origin-x": `${lightboxOrigin.x + lightboxOrigin.width / 2 - window.innerWidth / 2}px`, "--origin-y": `${lightboxOrigin.y + lightboxOrigin.height / 2 - window.innerHeight / 2}px`, "--origin-scale": String(Math.max(0.12, Math.min(1, lightboxOrigin.width / Math.min(1180, window.innerWidth - 48)))) } as React.CSSProperties) : undefined} role="dialog" aria-modal="true" aria-label={`Photo ${currentIndex + 1} of ${photos.length}: ${current.title}`}><button ref={lightboxCloseRef} className="lightbox-close" aria-label="Close photo details" onClick={() => setLightbox(null)}>×</button><div className="lightbox-image" onTouchStart={(event) => { event.currentTarget.dataset.touchStartX = String(event.touches[0].clientX); }} onTouchEnd={(event) => { const delta = event.changedTouches[0].clientX - Number(event.currentTarget.dataset.touchStartX); if (Math.abs(delta) > 70) setLightbox(photos[Math.min(photos.length - 1, Math.max(0, currentIndex + (delta < 0 ? 1 : -1)))].id); }}><ResponsiveImage variants={current.variants} alt={current.altText ?? current.title} sizes="(max-width: 800px) 100vw, 65vw" loading="eager" /><button className="lightbox-prev" aria-label="Previous photo" disabled={currentIndex <= 0} onClick={() => setLightbox(photos[currentIndex - 1]?.id)}>←</button><button className="lightbox-next" aria-label="Next photo" disabled={currentIndex >= photos.length - 1} onClick={() => setLightbox(photos[currentIndex + 1]?.id)}>→</button></div><aside className="lightbox-info"><p className="eyebrow">{current.category ?? "Wildlife"} · {current.photoYear ?? new Date(current.createdAt).getUTCFullYear()}</p>{current.award && <span className="award-badge">{current.award}</span>}<h2>{current.title}</h2><p className="lightbox-byline">{current.photographerCredit ?? "Photographer uncredited"}{current.owner && !current.owner.isSystem && <> · <a href={`/u/${encodeURIComponent(current.owner.username)}`}>@{current.owner.username}</a></>}{current.locationName && ` · ${current.locationName}`}{current.locationCountry && `, ${current.locationCountry}`}</p>{(current.speciesCommon || current.speciesLatin) && <p className="species-line">{current.speciesCommon}{current.speciesLatin && <> <i>{current.speciesLatin}</i></>}</p>}<p>{current.caption ?? "A moment in the wild, preserved in light."}</p>{current.story && <p className="story-copy">{current.story}</p>}<div className="lightbox-tags">{current.tags.map((tag) => <span key={tag.slug}>{tag.name}</span>)}</div><div className="lightbox-actions"><button className="outline-button" onClick={() => toggleSelected(current.id)}>{selected.includes(current.id) ? "✓ In my set" : "+ Add to my set"}</button><button className="outline-button" onClick={() => void copyLink(`${window.location.origin}${window.location.pathname}?photo=${current.id}`)}>{copied ? "Copied!" : "Copy link ↗"}</button>{authUser?.id === current.owner?.id && <a className="outline-button" href={`/photos/${current.id}/edit`}>Edit image</a>}{authUser?.id === current.owner?.id && <button className="outline-button delete-photo-button" onClick={() => void deletePhoto()}>Delete photo</button>}<span>{currentIndex + 1} / {total}</span></div>{deleteError && <p className="auth-error" role="alert">{deleteError}</p>}</aside></section></div>}
    {shareOpen && <div className="share-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShareOpen(false); }}><section className="share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-heading"><button className="icon-button" aria-label="Close share dialog" onClick={() => setShareOpen(false)}>×</button><p className="eyebrow">A collection of your own</p><h2 id="share-heading">Share your set</h2><p>{selected.length} {selected.length === 1 ? "photograph" : "photographs"} gathered in one place.</p><label className="share-link-label">Your shareable link<input readOnly value={shareUrl()} onFocus={(event) => event.currentTarget.select()} /></label><button className="solid-button" onClick={() => void copyLink(shareUrl())}>{copied ? "Copied! ✓" : "Copy link"}</button></section></div>}
    {authDialog && <AuthDialog initialMode={authDialog} onClose={() => setAuthDialog(null)} onAuthenticated={(user, token) => { setAuthUser(user); setCsrfToken(token); setAuthDialog(null); }} />}
  </div>;
}
