import React from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, Outlet, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, dateTime, dateTimeInputs, money, useLoad } from './api.js';

const FALLBACK = '/images/food-fallback.svg';
const STATUS_LABEL = { PENDING: 'Chờ xác nhận', CONFIRMED: 'Đã xác nhận', SEATED: 'Đang dùng bữa', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy', NO_SHOW: 'Không đến' };

function Loading({ label = 'Đang tải dữ liệu…' }) { return <p className="api-state" role="status"><span className="api-spinner" aria-hidden="true" />{label}</p>; }
function ErrorState({ message, onRetry }) { return <div className="api-error" role="alert"><p>{message}</p>{onRetry && <button className="admin-secondary-button" type="button" onClick={onRetry}>Thử lại</button>}</div>; }
function EmptyState({ children = 'Chưa có nội dung để hiển thị.' }) { return <p className="empty-state">{children}</p>; }
function ReservationStatusBadge({ status }) {
  const knownStatus = typeof status === 'string' && Object.hasOwn(STATUS_LABEL, status);
  return <span className={`status-badge ${knownStatus ? `status-${status.toLowerCase()}` : 'status-cancelled'}`}>{knownStatus ? STATUS_LABEL[status] : 'Chưa cập nhật'}</span>;
}

function useLegacyPageEffects() {
  const location = useLocation();
  const routeKey = `${location.pathname}${location.search}`;
  const previousRoute = React.useRef(routeKey);
  React.useEffect(() => {
    document.documentElement.classList.remove('no-js');
    document.documentElement.classList.add('js');
    if (!location.hash) window.scrollTo(0, 0);
    const main = document.querySelector('.customer-shell main, .admin-main');
    if (!main) return undefined;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const observer = !reducedMotion && 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (isIntersecting) {
          target.classList.add('is-visible');
          observer.unobserve(target);
        }
      });
    }, { threshold: [0, 0.06], rootMargin: '12% 0px 12% 0px' }) : null;
    const observed = new WeakSet();
    let revealIndex = 0;
    let cardIndex = 0;
    let directionalIndex = 0;
    const observe = () => main.querySelectorAll('.reveal, .page-hero-inner, .cta-ornament').forEach((target) => {
      if (observed.has(target)) return;
      observed.add(target);
      const isCard = target.matches('.dish-card, .chef-mini, .chef-profile');
      const isIllustration = target.matches('.story-art, .hero-photo, .cta-ornament');
      target.style.setProperty('--reveal-delay', `${(revealIndex++ % 5) * 55}ms`);
      if (target.matches('.reveal-copy, .reveal-paper') && !target.dataset.revealFrom) {
        target.dataset.revealFrom = directionalIndex % 2 === 0 ? 'left' : 'right';
      }
      if (target.matches('.reveal-copy, .reveal-paper')) directionalIndex += 1;
      if (isCard) {
        target.classList.add('reveal-card');
        target.style.setProperty('--card-tilt', cardIndex % 2 ? '2.8deg' : '-2.8deg');
        target.style.setProperty('--card-wobble', cardIndex % 2 ? '-.8deg' : '.8deg');
        target.style.setProperty('--reveal-delay', `${(cardIndex++ % 6) * 65}ms`);
      }
      if (isIllustration) target.classList.add('reveal-illustration');
      if (observer && !reducedMotion) {
        target.classList.add('reveal-pending');
        observer.observe(target);
      } else target.classList.add('is-visible');
    });
    observe();
    const mutations = new MutationObserver(observe);
    mutations.observe(main, { childList: true, subtree: true });
    return () => { mutations.disconnect(); observer?.disconnect(); };
  }, [location.pathname, location.search, location.hash]);
  React.useEffect(() => {
    const previous = previousRoute.current;
    previousRoute.current = routeKey;
    const overlay = document.querySelector('.page-transition');
    if (previous === routeKey || !overlay || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    overlay.classList.add('is-active');
    const timer = window.setTimeout(() => overlay.classList.remove('is-active'), 240);
    return () => window.clearTimeout(timer);
  }, [routeKey]);
}

function PublicShell() {
  const [open, setOpen] = React.useState(false);
  useLegacyPageEffects();
  const location = useLocation();
  const path = location.pathname;
  const navRef = React.useRef(null);
  const toggleRef = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    const onPointerDown = (event) => {
      if (!navRef.current?.contains(event.target) && !toggleRef.current?.contains(event.target)) setOpen(false);
    };
    const media = window.matchMedia('(min-width: 761px)');
    const onMediaChange = () => setOpen(false);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    media.addEventListener?.('change', onMediaChange);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
      media.removeEventListener?.('change', onMediaChange);
    };
  }, [open]);
  const footerHours = useLoad('/api/config');
  const hours = footerHours.data || { openingTime: '11:00', closingTime: '22:00' };
  return <div className="customer-shell">
    <div className="page-transition" aria-hidden="true"><div className="page-transition-card"><svg className="transition-nonla" viewBox="0 0 160 96" focusable="false"><path className="transition-nonla-canopy" d="M80 8C67 31 41 49 8 70c30 19 114 19 144 0C119 49 93 31 80 8Z" /><path className="transition-nonla-rib" d="M80 10 25 75M80 10 52 80M80 10v82M80 10l28 70M80 10l55 65M11 71c35 17 103 17 138 0" /><path className="transition-nonla-band" d="M8 70c30 19 114 19 144 0" /></svg><span className="transition-caption">BẾP HỘI</span></div></div>
    <a className="skip-link" href="#main-content">Đi đến nội dung</a>
    <header className="site-header"><div className="site-header-inner">
      <Link className="site-brand" to="/" aria-label="Bếp Hội — về trang chủ"><span className="brand-mark" aria-hidden="true">B</span><span className="brand-words">BẾP <strong>HỘI</strong><small>MÓN VIỆT, VỊ PHỐ HỘI</small></span></Link>
      <button ref={toggleRef} className="mobile-nav-toggle" type="button" aria-expanded={open} aria-controls="primary-navigation" aria-label="Mở điều hướng" onClick={() => setOpen((value) => !value)}><span /><span /><span className="visually-hidden">Mở điều hướng</span></button>
      <nav ref={navRef} id="primary-navigation" className={`primary-navigation ${open ? 'is-open' : ''}`} aria-label="Điều hướng chính">
        <NavLink to="/" end className={path === '/' ? 'is-current' : ''} aria-current={path === '/' ? 'page' : undefined} onClick={() => setOpen(false)}>Trang chủ</NavLink>
        <NavLink to="/menu" className={path.startsWith('/menu') || path.startsWith('/dishes') ? 'is-current' : ''} aria-current={path.startsWith('/menu') || path.startsWith('/dishes') ? 'page' : undefined} onClick={() => setOpen(false)}>Thực đơn</NavLink>
        <NavLink to="/chefs" className={path.startsWith('/chefs') ? 'is-current' : ''} aria-current={path.startsWith('/chefs') ? 'page' : undefined} onClick={() => setOpen(false)}>Người giữ bếp</NavLink>
        <Link className="nav-booking" to="/reservations/new" onClick={() => setOpen(false)}>Gửi yêu cầu đặt bàn <span aria-hidden="true">↗</span></Link>
      </nav>
    </div></header>
    <main id="main-content"><Outlet /></main>
    <footer className="site-footer"><div className="footer-main">
      <div className="footer-brand-block"><Link className="site-brand site-brand-footer" to="/" aria-label="Bếp Hội — về trang chủ"><span className="brand-mark" aria-hidden="true">B</span><span className="brand-words">BẾP <strong>HỘI</strong><small>MÓN VIỆT, VỊ PHỐ HỘI</small></span></Link><p>Món quen được nấu chậm, mời bạn ngồi lại lâu hơn một chút.</p></div>
      <div><h2>Ghé bếp</h2><p>18 Bạch Đằng<br />Hội An, Quảng Nam</p><p><a href="tel:+842353860188">+84 235 386 0188</a></p></div>
      <div><h2>Giờ đón khách</h2><p>Mỗi ngày<br />{hours.openingTime} – {hours.closingTime}</p><Link to="/reservations/new">Gửi yêu cầu đặt bàn <span aria-hidden="true">↗</span></Link></div>
      <div><h2>Khám phá</h2><p><Link to="/menu">Thực đơn</Link></p><p><Link to="/chefs">Người giữ bếp</Link></p></div>
    </div><div className="footer-bottom"><span>© {new Date().getFullYear()} Bếp Hội</span><span>Nấu bằng sự tử tế, mời bằng sự chân thành.</span><Link to="/admin">Quản trị <span aria-hidden="true">↗</span></Link></div></footer>
  </div>;
}

function AdminShell() {
  useLegacyPageEffects();
  const location = useLocation();
  return <div className="admin-shell">
    <a className="skip-link" href="#main-content">Đi đến nội dung</a>
    <header className="admin-topbar"><Link className="admin-brand" to="/admin"><span className="brand-mark" aria-hidden="true">B</span><span>BẾP HỘI <small>QUẢN TRỊ</small></span></Link><Link className="admin-back-link" to="/" target="_blank" rel="noreferrer">Xem website <span aria-hidden="true">↗</span></Link></header>
    <div className="admin-frame"><aside className="admin-sidebar" aria-label="Điều hướng quản trị"><p className="admin-sidebar-label">NỘI DUNG NHÀ HÀNG</p>
      <NavLink end className={`admin-nav-link ${location.pathname === '/admin' ? 'is-current' : ''}`} to="/admin"><span aria-hidden="true">⌂</span> Tổng quan</NavLink>
      <NavLink className={`admin-nav-link ${location.pathname.startsWith('/admin/dishes') ? 'is-current' : ''}`} to="/admin/dishes"><span aria-hidden="true">◉</span> Món ăn</NavLink>
      <NavLink className={`admin-nav-link ${location.pathname.startsWith('/admin/ingredients') ? 'is-current' : ''}`} to="/admin/ingredients"><span aria-hidden="true">✳</span> Nguyên liệu</NavLink>
      <NavLink className={`admin-nav-link ${location.pathname.startsWith('/admin/reservations') ? 'is-current' : ''}`} to="/admin/reservations"><span aria-hidden="true">▦</span> Đặt bàn</NavLink>
      <NavLink className={`admin-nav-link ${location.pathname.startsWith('/admin/chefs') ? 'is-current' : ''}`} to="/admin/chefs"><span aria-hidden="true">♨</span> Đầu bếp</NavLink>
    </aside><main id="main-content" className="admin-main"><Outlet /></main></div>
  </div>;
}

function DishCard({ dish, index = 0 }) {
  return <article className="dish-card reveal"><Link to={`/dishes/${dish.id}`} className="dish-card-image"><img src={dish.imageUrl || FALLBACK} alt={dish.name} loading="lazy" onError={(event) => { event.currentTarget.src = FALLBACK; }} /><span className="dish-card-index">{String(index + 1).padStart(2, '0')}</span>{dish.isAvailable === false && <span className="availability-ribbon">Tạm hết hôm nay</span>}</Link>
    <div className="dish-card-meta"><span>{dish.category?.name || 'Món Việt'}</span><span>{money(dish.price)}</span></div><h2><Link to={`/dishes/${dish.id}`}>{dish.name}</Link></h2><p>{dish.description}</p>
    <ul className="ingredient-list" aria-label="Nguyên liệu">{(dish.ingredients || []).map(({ ingredient, ingredientId }) => <li key={ingredientId}>{ingredient?.name}</li>)}</ul>
  </article>;
}

function HomePage() {
  const state = useLoad('/api/home');
  return <>
    <section className="home-hero paper-texture" data-lantern-section data-scroll-drift>
      <div className="hero-content wrap">
        <div className="hero-copy reveal reveal-copy" data-reveal-from="left"><p className="eyebrow"><span className="eyebrow-rule" /> MỘT GÓC BẾP BÊN SÔNG HOÀI</p><h1 className="home-brandline" aria-label="Vị nhà phố Hội"><HoverText>VỊ NHÀ</HoverText><br /><em><HoverText>PHỐ HỘI</HoverText></em></h1><p className="hero-intro">Từ nồi nước dùng thơm mùi quế hồi đến đĩa rau vườn còn đẫm sương — món Việt ở đây được nấu như một lời mời trở về.</p><div className="hero-actions"><Link className="button button-dark" to="/menu">Khám phá thực đơn <span aria-hidden="true">↗</span></Link><Link className="text-link" to="/reservations/new">Gửi yêu cầu đặt bàn</Link></div></div>
        <figure className="hero-photo reveal"><img src="https://danangfantasticity.com/wp-content/uploads/2024/04/tong-hop-cac-mon-an-nhat-dinh-phai-thu-khi-den-da-nang-hoi-an-CAO-LAU-1024x576.jpg" alt="Tô mì nóng với rau thơm và nước dùng trong" fetchPriority="high" /><span className="photo-stamp">BẾP<br />HỘI</span><figcaption><span>01 / MÓN NHÀ</span><span>CAO LẦU HỘI AN</span></figcaption></figure>
        <span className="hero-side-note" aria-hidden="true">HƯƠNG VỊ ĐI CÙNG KÝ ỨC</span>
      </div><div className="hero-bottom wrap"><span>HỘI AN · VIỆT NAM</span><span>CHẬM MỘT NHỊP, NGON MỘT ĐỜI</span><a href="#cau-chuyen">Cuộn xuống <span aria-hidden="true">↓</span></a></div><span className="hero-lantern" aria-hidden="true" />
    </section>
    <div className="marquee-band" aria-label="Bếp Hội — món Việt, vị phố Hội"><div className="marquee-track" aria-hidden="true"><span>MÓN VIỆT THÂN QUEN</span><i>✳</i><span>NẤU TỪ NGUYÊN LIỆU TƯƠI</span><i>✳</i><span>MỜI BẠN NGỒI LẠI</span><i>✳</i><span>MÓN VIỆT THÂN QUEN</span><i>✳</i><span>NẤU TỪ NGUYÊN LIỆU TƯƠI</span><i>✳</i></div></div>
    <section className="story-section section-pad" id="cau-chuyen" data-lantern-section data-scroll-drift><div className="wrap story-grid"><div className="story-art reveal reveal-paper" data-reveal-from="left"><img src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1100&q=85" alt="Không gian bàn ăn ấm cúng với ánh đèn vàng" loading="lazy" data-scroll-drift /><span className="story-art-label">BỮA CƠM<br />THÂN TÌNH</span></div><div className="story-copy"><p className="eyebrow reveal reveal-copy" data-reveal-from="left">01 / CHUYỆN CỦA BẾP</p><h2 className="reveal reveal-copy" data-reveal-from="left">Giữ vị cũ,<br /><em>mời vị mới.</em></h2><p className="reveal reveal-copy" data-reveal-from="right">Bếp Hội bắt đầu từ một câu hỏi giản dị: bữa ăn quê nhà có thể làm ta thấy bình yên đến đâu? Chúng tôi chọn nguyên liệu tươi từ những người trồng quen, giữ cách nêm nếm vừa tay và để mỗi món có chỗ cho câu chuyện riêng.</p><p className="reveal reveal-copy" data-reveal-from="right">Không cần vội. Một chiếc bàn gỗ, một nồi nước dùng nóng và những người mình thương — vậy là đủ cho một buổi tối đẹp.</p><Link className="text-link reveal reveal-copy" data-reveal-from="right" to="/chefs">Gặp những người giữ bếp <span aria-hidden="true">↗</span></Link></div></div><span className="section-lantern" aria-hidden="true" /></section>
    <section className="featured-section section-pad paper-texture" data-lantern-section data-scroll-drift><div className="wrap"><div className="section-heading reveal reveal-copy" data-reveal-from="left"><div><p className="eyebrow">02 / MÓN ĐƯỢC NHỚ</p><h2>Vừa quen,<br /><em>vừa thương.</em></h2></div><Link className="button button-outline" to="/menu">Xem toàn bộ thực đơn <span aria-hidden="true">↗</span></Link></div>
      {state.loading ? <Loading label="Đang chuẩn bị thực đơn…" /> : state.error ? <ErrorState message={state.error} onRetry={state.reload} /> : state.data?.dishes?.length ? <div className="dish-card-grid">{state.data.dishes.map((dish, index) => <DishCard key={dish.id} dish={dish} index={index} />)}</div> : <div className="empty-state"><h2>Thực đơn đang được chuẩn bị.</h2><p>Mời bạn quay lại sau nhé.</p></div>}
    </div><span className="section-lantern section-lantern--left" aria-hidden="true" /></section>
    <section className="chef-preview section-pad" data-lantern-section><div className="wrap chef-preview-grid"><div className="chef-preview-copy reveal reveal-copy" data-reveal-from="right"><p className="eyebrow">03 / BÀN TAY SAU MỖI MÓN</p><h2>Người giữ lửa<br /><em>cho căn bếp.</em></h2><p>Mỗi người một miền ký ức, cùng gặp nhau bên chiếc chảo nóng và những bó rau thơm đầu ngày.</p><Link className="button button-dark" to="/chefs">Gặp người giữ bếp <span aria-hidden="true">↗</span></Link></div><div className="chef-mini-grid">{state.loading ? <Loading label="Đang giới thiệu đội ngũ bếp…" /> : state.error ? <ErrorState message={state.error} onRetry={state.reload} /> : state.data?.chefs?.length ? state.data.chefs.map((chef, index) => <ChefMini key={chef.id} chef={chef} index={index} />) : <p className="empty-state">Những người giữ bếp sẽ sớm được giới thiệu.</p>}</div></div><span className="section-lantern" aria-hidden="true" /></section>
    <section className="reservation-cta paper-texture" data-lantern-section data-scroll-drift><div className="wrap reservation-cta-inner reveal reveal-copy" data-reveal-from="right"><p className="eyebrow">04 / BỮA ĂN ĐANG CHỜ BẠN</p><h2>Một chiếc bàn<br /><em>để ngồi thật lâu.</em></h2><p>Gửi lời nhắn cho bếp; chúng tôi sẽ liên hệ để xác nhận thời gian phù hợp. Yêu cầu gửi đi chưa phải là xác nhận chỗ ngồi.</p><Link className="button button-light" to="/reservations/new">Gửi yêu cầu đặt bàn <span aria-hidden="true">↗</span></Link></div><span className="cta-ornament" aria-hidden="true">❋</span><span className="section-lantern section-lantern--left" aria-hidden="true" /></section>
  </>;
}

function ChefMini({ chef, index }) {
  return <article className="chef-mini reveal"><div className="chef-mini-image"><img src={chef.imageUrl || FALLBACK} alt={`Chân dung ${chef.name}`} loading="lazy" onError={(event) => { event.currentTarget.src = FALLBACK; }} /><span>{String(index + 1).padStart(2, '0')}</span></div><p>{chef.title}</p><h3>{chef.name}</h3></article>;
}

function HoverText({ children }) {
  const pieces = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter('vi', { granularity: 'grapheme' }).segment(children), ({ segment }) => segment)
    : Array.from(children);
  return <>{pieces.map((piece, index) => /^\s+$/u.test(piece) ? <React.Fragment key={index}>{piece}</React.Fragment> : <span className="hover-letter" aria-hidden="true" key={index}>{piece}</span>)}</>;
}

function getPageNumberWindow(currentPage, pageCount) {
  const total = Math.max(1, Number(pageCount) || 1);
  const current = Math.min(total, Math.max(1, Number(currentPage) || 1));
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

  const start = Math.max(2, current - 2);
  const end = Math.min(total - 1, current + 2);
  const items = [1];
  if (start > 2) items.push('ellipsis-before');
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < total - 1) items.push('ellipsis-after');
  items.push(total);
  return items;
}

function MenuPage() {
  const [params, setParams] = useSearchParams();
  const [paginationMode, setPaginationMode] = React.useState('pages');
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [menuState, setMenuState] = React.useState({ items: [], categories: [], total: 0, page: 1, pageSize: 6, pageCount: 1, loading: true, loadingMore: false, error: '' });
  const settingsRef = React.useRef(null);
  const infiniteSentinelRef = React.useRef(null);
  const menuRequestRef = React.useRef({ id: 0, controller: null });
  const requestedPage = Number(params.get('page'));
  const numberedPage = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const apiParams = new URLSearchParams();
  if (params.get('q')) apiParams.set('q', params.get('q'));
  if (params.get('category') || params.get('categoryId')) apiParams.set('categoryId', params.get('category') || params.get('categoryId'));
  const query = apiParams.toString();
  const requestMenuPage = React.useCallback(async (targetPage, append = false) => {
    menuRequestRef.current.controller?.abort();
    const controller = new AbortController();
    const requestId = menuRequestRef.current.id + 1;
    menuRequestRef.current = { id: requestId, controller };
    setMenuState((current) => append
      ? { ...current, loadingMore: true, error: '' }
      : { ...current, items: [], page: targetPage, loading: true, loadingMore: false, error: '' });
    const requestParams = new URLSearchParams(query);
    requestParams.set('page', String(targetPage));
    try {
      const data = await api(`/api/menu?${requestParams.toString()}`, { signal: controller.signal });
      if (menuRequestRef.current.id !== requestId) return;
      setMenuState((current) => {
        const items = append
          ? [...current.items, ...data.items.filter((item) => !current.items.some((existing) => existing.id === item.id))]
          : data.items;
        return { ...current, ...data, items, loading: false, loadingMore: false, error: '' };
      });
    } catch (requestError) {
      if (requestError.name === 'AbortError' || menuRequestRef.current.id !== requestId) return;
      setMenuState((current) => ({ ...current, loading: false, loadingMore: false, error: requestError.message }));
    }
  }, [query]);
  React.useEffect(() => {
    requestMenuPage(paginationMode === 'pages' ? numberedPage : 1);
    return () => menuRequestRef.current.controller?.abort();
  }, [numberedPage, paginationMode, requestMenuPage]);
  React.useEffect(() => {
    if (!settingsOpen) return undefined;
    function closeSettings(event) {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && settingsRef.current?.contains(event.target)) return;
      setSettingsOpen(false);
    }
    document.addEventListener('pointerdown', closeSettings);
    document.addEventListener('keydown', closeSettings);
    return () => {
      document.removeEventListener('pointerdown', closeSettings);
      document.removeEventListener('keydown', closeSettings);
    };
  }, [settingsOpen]);
  React.useEffect(() => {
    if (paginationMode !== 'infinite' || menuState.loading || menuState.loadingMore || menuState.page >= menuState.pageCount || !infiniteSentinelRef.current) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) requestMenuPage(menuState.page + 1, true);
    }, { rootMargin: '240px 0px' });
    observer.observe(infiniteSentinelRef.current);
    return () => observer.disconnect();
  }, [menuState.loading, menuState.loadingMore, menuState.page, menuState.pageCount, paginationMode, requestMenuPage]);
  function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    if (form.get('q')) next.set('q', String(form.get('q')).trim());
    if (form.get('categoryId')) next.set('category', String(form.get('categoryId')));
    setParams(next);
  }
  function selectPaginationMode(mode) {
    if (mode !== 'pages' && params.has('page')) {
      const next = new URLSearchParams(params);
      next.delete('page');
      setParams(next);
    }
    setPaginationMode(mode);
    setSettingsOpen(false);
  }
  function goToNumberedPage(page) {
    const next = new URLSearchParams(params);
    next.set('page', String(page));
    setParams(next);
  }
  const categoryId = params.get('category') || params.get('categoryId') || '';
  return <>
    <section className="page-hero page-hero-menu paper-texture" data-lantern-section data-scroll-drift><div className="wrap page-hero-inner reveal-copy" data-reveal-from="left"><p className="eyebrow">MÓN VIỆT · VỊ PHỐ HỘI</p><h1>Món ngon<br /><em>đợi bạn.</em></h1><p>Món ăn theo mùa, nấu vừa tay và luôn có một chút hương vị nhà.</p></div><span className="section-lantern" aria-hidden="true" /></section>
    <section className="menu-section section-pad"><div className="wrap">
      <form className="menu-search" onSubmit={submit} role="search"><label className="visually-hidden" htmlFor="dish-search">Tìm món ăn hoặc nguyên liệu</label><input id="dish-search" type="search" name="q" defaultValue={params.get('q') || ''} placeholder="Tìm tên món, nguyên liệu…" /><div className="menu-search-actions"><button className="button button-dark" type="submit" disabled={menuState.loading}>Tìm món <span aria-hidden="true">⌕</span></button><div className="menu-pagination-settings" ref={settingsRef}><button className="menu-settings-button" type="button" aria-label="Chọn kiểu phân trang" aria-expanded={settingsOpen} aria-controls="menu-pagination-options" onClick={() => setSettingsOpen((open) => !open)}><span aria-hidden="true">⚙</span></button>{settingsOpen && <div className="menu-pagination-options" id="menu-pagination-options" role="menu" aria-label="Kiểu phân trang"><p>Kiểu xem thực đơn</p><button className={paginationMode === 'pages' ? 'is-active' : ''} type="button" role="menuitemradio" aria-checked={paginationMode === 'pages'} onClick={() => selectPaginationMode('pages')}><span aria-hidden="true">1 2 3</span><strong>Phân trang</strong></button><button className={paginationMode === 'load-more' ? 'is-active' : ''} type="button" role="menuitemradio" aria-checked={paginationMode === 'load-more'} onClick={() => selectPaginationMode('load-more')}><span aria-hidden="true">＋</span><strong>Tải thêm</strong></button><button className={paginationMode === 'infinite' ? 'is-active' : ''} type="button" role="menuitemradio" aria-checked={paginationMode === 'infinite'} onClick={() => selectPaginationMode('infinite')}><span aria-hidden="true">↓</span><strong>Cuộn vô hạn</strong></button></div>}</div></div></form>
      <nav className="category-filter" aria-label="Lọc theo danh mục"><Link className={categoryId ? '' : 'is-active'} to={`/menu${params.get('q') ? `?q=${encodeURIComponent(params.get('q'))}` : ''}`}>Tất cả món</Link>{menuState.categories.map((category) => <Link key={category.id} className={categoryId === category.id ? 'is-active' : ''} to={`/menu?category=${encodeURIComponent(category.id)}${params.get('q') ? `&q=${encodeURIComponent(params.get('q'))}` : ''}`} aria-current={categoryId === category.id ? 'page' : undefined}>{category.name}</Link>)}</nav>
      {menuState.loading ? <Loading /> : menuState.error && !menuState.items.length ? <ErrorState message={menuState.error} onRetry={() => requestMenuPage(menuState.page)} /> : <><p className="result-count">{menuState.total} món{params.get('q') ? ` phù hợp với “${params.get('q')}”` : ''}</p>{menuState.items.length ? <><div className="dish-card-grid menu-card-grid">{menuState.items.map((dish, index) => <DishCard key={dish.id} dish={dish} index={(paginationMode === 'pages' ? (menuState.page - 1) * menuState.pageSize : 0) + index} />)}</div>{menuState.error && <ErrorState message={menuState.error} onRetry={() => requestMenuPage(menuState.page + 1, true)} />}{paginationMode === 'pages' && menuState.pageCount > 1 && <nav className="menu-page-numbers" aria-label="Phân trang thực đơn"><button type="button" disabled={menuState.page === 1 || menuState.loading} onClick={() => requestMenuPage(menuState.page - 1)}>← Trước</button>{getPageNumberWindow(menuState.page, menuState.pageCount).map((item) => typeof item === 'number'
                ? <button className={`menu-page-number${item === menuState.page ? ' is-active' : ''}`} type="button" aria-current={item === menuState.page ? 'page' : undefined} disabled={menuState.loading} onClick={() => requestMenuPage(item)} key={item}>{item}</button>
                : <span className="menu-page-ellipsis" key={item} aria-hidden="true">…</span>)}<span className="menu-page-status" aria-live="polite">Trang {menuState.page} / {menuState.pageCount}</span><button type="button" disabled={menuState.page === menuState.pageCount || menuState.loading} onClick={() => requestMenuPage(menuState.page + 1)}>Sau →</button></nav>}{paginationMode === 'load-more' && <div className="menu-load-more">{menuState.page < menuState.pageCount ? <button className="button button-outline" type="button" disabled={menuState.loadingMore} onClick={() => requestMenuPage(menuState.page + 1, true)}>{menuState.loadingMore ? 'Đang tải…' : <>Tải thêm món <span aria-hidden="true">↓</span></>}</button> : <p>Đã hiển thị toàn bộ {menuState.total} món.</p>}</div>}{paginationMode === 'infinite' && <div className="menu-infinite-sentinel" ref={infiniteSentinelRef} aria-live="polite">{menuState.page < menuState.pageCount ? <>{menuState.loadingMore && <span className="api-spinner" aria-hidden="true" />}{menuState.loadingMore ? 'Đang tải thêm món…' : 'Cuộn xuống để xem thêm'}</> : <span>Đã hiển thị toàn bộ {menuState.total} món.</span>}</div>}</> : <div className="empty-state"><h2>Chưa tìm thấy món phù hợp</h2><p>Thử một từ khóa khác hoặc xem tất cả món trong thực đơn.</p><Link className="text-link" to="/menu">Xem tất cả món <span aria-hidden="true">↗</span></Link></div>}</>}
    </div><span className="section-lantern section-lantern--left" aria-hidden="true" /></section>
  </>;
}

function ChefsPage() {
  const state = useLoad('/api/chefs');
  return <><section className="page-hero page-hero-chefs paper-texture" data-lantern-section data-scroll-drift><div className="wrap page-hero-inner reveal-copy" data-reveal-from="left"><p className="eyebrow">BÀN TAY SAU MỖI MÓN</p><h1>Người giữ<br /><em>lửa bếp.</em></h1><p>Mỗi đầu bếp mang theo một miền ký ức và một cách riêng để chăm chút bữa ăn.</p></div><span className="section-lantern" aria-hidden="true" /></section>
    <section className="chefs-section section-pad" data-lantern-section><div className="wrap">{state.loading ? <Loading /> : state.error ? <ErrorState message={state.error} onRetry={state.reload} /> : state.data?.items?.length ? <div className="chef-profile-grid">{state.data.items.map((chef, index) => <article className="chef-profile reveal" key={chef.id}><div className="chef-profile-image"><img src={chef.imageUrl || FALLBACK} alt={`Chân dung ${chef.name}`} loading="lazy" onError={(event) => { event.currentTarget.src = FALLBACK; }} /><span className="chef-profile-number">{String(index + 1).padStart(2, '0')}</span></div><div className="chef-profile-copy"><p className="eyebrow">{chef.title}</p><h2>{chef.name}</h2>{chef.specialty && <p className="chef-specialty">{chef.specialty}</p>}{chef.bio && <p>{chef.bio}</p>}</div></article>)}</div> : <p className="empty-state">Những người giữ bếp sẽ sớm được giới thiệu.</p>}
      <aside className="chefs-invite" aria-labelledby="chefs-invite-title"><div className="chefs-invite-copy"><p className="eyebrow">TỪ BẾP ĐẾN BÀN ĂN</p><h2 id="chefs-invite-title">Gặp đầu bếp<br /><em>qua từng món ngon.</em></h2><p>Mỗi món ăn mang dấu ấn của người đứng bếp. Khám phá thực đơn theo mùa, rồi gửi lời nhắn để chúng tôi chuẩn bị đón bạn.</p></div><div className="chefs-invite-actions"><Link className="button button-light" to="/menu">Khám phá thực đơn <span aria-hidden="true">↗</span></Link><Link className="text-link" to="/reservations/new">Gửi yêu cầu đặt bàn <span aria-hidden="true">↗</span></Link></div></aside>
    </div><span className="section-lantern section-lantern--left" aria-hidden="true" /></section></>;
}

function DishPage() {
  const { id } = useParams();
  const state = useLoad(`/api/dishes/${encodeURIComponent(id)}`);
  if (state.loading) return <Loading />;
  if (state.error) return <section className="error-page section-pad"><div className="wrap error-card"><p className="eyebrow">MÓN ĂN</p><h1>Chưa tìm thấy<br /><em>món này.</em></h1><p>Món ăn có thể đã được gỡ khỏi thực đơn. Bạn có thể quay lại để xem các món khác.</p><Link className="button button-dark" to="/menu">Trở lại thực đơn <span aria-hidden="true">↗</span></Link></div></section>;
  const dish = state.data;
  return <section className="dish-detail-page section-pad" data-lantern-section><div className="wrap"><Link className="back-link" to="/menu">← Trở lại thực đơn</Link><article className="dish-detail-grid"><figure className="dish-detail-photo reveal reveal-paper" data-reveal-from="left"><img src={dish.imageUrl || FALLBACK} alt={dish.name} fetchPriority="high" onError={(event) => { event.currentTarget.src = FALLBACK; }} /></figure><div className="dish-detail-copy reveal reveal-copy" data-reveal-from="right"><p className="eyebrow">{dish.category?.name || 'THỰC ĐƠN'} / MÓN NHÀ</p><h1>{dish.name}</h1><p className="dish-detail-price">{money(dish.price)}</p><p className="dish-detail-description">{dish.description}</p><p className={`availability ${dish.isAvailable ? 'available' : 'unavailable'}`}><span />{dish.isAvailable ? 'Đang có món' : 'Món tạm hết hôm nay'}</p>{dish.chef && <p className="dish-chef-credit"><strong>Người giữ bếp:</strong> {dish.chef.name}</p>}<h2>Nguyên liệu</h2>{dish.ingredients?.length ? <ul className="ingredient-list" aria-label="Nguyên liệu">{dish.ingredients.map((link) => <li key={link.ingredientId}>{link.ingredient?.name}</li>)}</ul> : <p>Thông tin nguyên liệu đang được cập nhật.</p>}<p className="dish-note">Thành phần có thể thay đổi nhẹ theo mùa. Vui lòng trao đổi với nhân viên nếu bạn có dị ứng thực phẩm.</p><Link className="button button-dark" to="/reservations/new">Gửi yêu cầu đặt bàn <span aria-hidden="true">↗</span></Link></div></article></div><span className="section-lantern section-lantern--right" aria-hidden="true" /></section>;
}

function ReservationPage() {
  const configState = useLoad('/api/config');
  const config = configState.data || { openingTime: '11:00', closingTime: '22:00', maxPartySize: 12 };
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState({});
  const [success, setSuccess] = React.useState('');
  function clearReservationFieldError(field) {
    setFieldErrors((old) => clearFieldError(old, field));
    setError('');
  }
  async function submit(event) {
    event.preventDefault(); setError(''); setFieldErrors({}); setSuccess('');
    const formElement = event.currentTarget;
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    const fieldErrors = {};
    if (!String(body.customerName || '').trim()) fieldErrors.customerName = 'Vui lòng nhập họ và tên.';
    if (String(body.phone || '').trim().length < 7 || !/^[+()\d\s.-]+$/.test(String(body.phone || ''))) fieldErrors.phone = 'Vui lòng kiểm tra số điện thoại.';
    if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email))) fieldErrors.email = 'Vui lòng nhập email hợp lệ.';
    const guests = Number(body.guestCount);
    if (!Number.isInteger(guests) || guests < 1 || guests > config.maxPartySize) fieldErrors.guestCount = `Số khách cần từ 1 đến ${config.maxPartySize}.`;
    const dateTimeValue = new Date(`${body.date}T${body.time}:00+07:00`);
    if (!body.date || !body.time || Number.isNaN(dateTimeValue.getTime()) || dateTimeValue <= new Date()) {
      if (!body.date || Number.isNaN(dateTimeValue.getTime()) || dateTimeValue <= new Date()) fieldErrors.date = 'Vui lòng chọn ngày trong tương lai.';
      if (!body.time || Number.isNaN(dateTimeValue.getTime())) fieldErrors.time = 'Vui lòng chọn giờ đến.';
    }
    if (body.time && (body.time < config.openingTime || body.time >= config.closingTime)) fieldErrors.time = `Giờ nhận yêu cầu là ${config.openingTime} đến trước ${config.closingTime}.`;
    if (String(body.customerNote || '').length > 1200) fieldErrors.customerNote = 'Lời nhắn tối đa 1200 ký tự.';
    if (Object.keys(fieldErrors).length) { setFieldErrors(fieldErrors); setError(Object.values(fieldErrors).join(' ')); return; }
    setBusy(true);
    try {
      const reservation = await api('/api/reservations', { method: 'POST', body: { ...body, guestCount: String(body.guestCount) } });
      setSuccess(reservation.referenceCode);
      formElement.reset();
    } catch (requestError) { setError(requestError.message); setFieldErrors(requestError.fields || {}); }
    finally { setBusy(false); }
  }
  return <><section className="page-hero page-hero-reservation paper-texture" data-lantern-section data-scroll-drift><div className="wrap page-hero-inner reveal-copy" data-reveal-from="left"><p className="eyebrow">MỜI BẠN NGỒI LẠI</p><h1>Gửi lời<br /><em>đặt bàn.</em></h1><p>Một lời nhắn nhỏ để bếp chuẩn bị đón bạn chu đáo hơn.</p></div><span className="section-lantern" aria-hidden="true" /></section>
    <section className="reservation-section section-pad" data-lantern-section><div className="wrap reservation-layout"><div className="reservation-intro reveal reveal-copy" data-reveal-from="left"><p className="eyebrow">THÔNG TIN ĐẶT BÀN</p><h2>Chúng tôi sẽ<br /><em>liên hệ xác nhận.</em></h2><p>Đây là yêu cầu đặt bàn, chưa phải xác nhận chỗ ngồi. Bếp sẽ liên hệ bạn theo số điện thoại đã gửi.</p><div className="reservation-hours"><span>Giờ nhận yêu cầu</span><strong>{config.openingTime} – {config.closingTime}</strong><span>Nhóm khách tối đa theo cấu hình hiện tại</span><strong>{config.maxPartySize} người</strong></div><p className="small-note">Thông tin giờ hoạt động và số khách tối đa là cấu hình mặc định của website, có thể được điều chỉnh cho nhà hàng.</p></div>
      <div className="reservation-form-card reveal reveal-copy" data-reveal-from="right">{success && <div className="reservation-success" role="status" aria-live="polite"><span className="success-mark" aria-hidden="true">✓</span><div><h2>Đã nhận lời nhắn của bạn</h2><p>Mã yêu cầu: <strong>{success}</strong></p><p>Yêu cầu đang chờ nhà hàng xác nhận. Chúng tôi sẽ liên hệ bạn sớm.</p></div></div>}{error && <div className="form-error-summary" role="alert" aria-live="polite"><strong>{Object.keys(fieldErrors).length ? 'Biểu mẫu còn một vài điểm cần chỉnh:' : 'Không thể gửi yêu cầu đặt bàn.'}</strong><p>{error}</p></div>}
        <form className="site-form" onSubmit={submit} noValidate aria-busy={busy}>
          <div className="form-field"><label htmlFor="customerName">Họ và tên <span aria-hidden="true">*</span></label><input id="customerName" name="customerName" maxLength="120" autoComplete="name" required aria-invalid={Boolean(fieldErrors.customerName)} aria-describedby={fieldErrors.customerName ? 'customerName-error' : undefined} onChange={() => clearReservationFieldError('customerName')} />{fieldErrors.customerName && <small id="customerName-error" className="field-error">{fieldErrors.customerName}</small>}</div>
          <div className="form-row"><div className="form-field"><label htmlFor="phone">Số điện thoại <span aria-hidden="true">*</span></label><input id="phone" name="phone" type="tel" maxLength="40" autoComplete="tel" required aria-invalid={Boolean(fieldErrors.phone)} aria-describedby={fieldErrors.phone ? 'phone-error' : undefined} onChange={() => clearReservationFieldError('phone')} />{fieldErrors.phone && <small id="phone-error" className="field-error">{fieldErrors.phone}</small>}</div><div className="form-field"><label htmlFor="email">Email <span className="label-optional">không bắt buộc</span></label><input id="email" name="email" type="email" maxLength="254" autoComplete="email" aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? 'email-error' : undefined} onChange={() => clearReservationFieldError('email')} />{fieldErrors.email && <small id="email-error" className="field-error">{fieldErrors.email}</small>}</div></div>
          <div className="form-row"><div className="form-field"><label htmlFor="date">Ngày đến <span aria-hidden="true">*</span></label><input id="date" name="date" type="date" min={new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)} required aria-invalid={Boolean(fieldErrors.date)} aria-describedby={fieldErrors.date ? 'date-error' : undefined} onChange={() => clearReservationFieldError('date')} />{fieldErrors.date && <small id="date-error" className="field-error">{fieldErrors.date}</small>}</div><div className="form-field"><label htmlFor="time">Giờ đến <span aria-hidden="true">*</span></label><input id="time" name="time" type="time" min={config.openingTime} max={config.closingTime} required aria-invalid={Boolean(fieldErrors.time)} aria-describedby={fieldErrors.time ? 'time-error' : undefined} onChange={() => clearReservationFieldError('time')} />{fieldErrors.time && <small id="time-error" className="field-error">{fieldErrors.time}</small>}</div></div>
          <div className="form-field"><label htmlFor="guestCount">Số khách <span aria-hidden="true">*</span></label><input id="guestCount" name="guestCount" type="number" min="1" max={config.maxPartySize} step="1" required aria-invalid={Boolean(fieldErrors.guestCount)} aria-describedby={fieldErrors.guestCount ? 'guestCount-error' : undefined} onChange={() => clearReservationFieldError('guestCount')} />{fieldErrors.guestCount && <small id="guestCount-error" className="field-error">{fieldErrors.guestCount}</small>}</div>
          <div className="form-field"><label htmlFor="customerNote">Lời nhắn cho bếp <span className="label-optional">không bắt buộc</span></label><textarea id="customerNote" name="customerNote" rows="4" maxLength="1200" placeholder="Dị ứng thực phẩm, dịp đặc biệt…" aria-invalid={Boolean(fieldErrors.customerNote)} aria-describedby={fieldErrors.customerNote ? 'customerNote-error' : undefined} onChange={() => clearReservationFieldError('customerNote')} />{fieldErrors.customerNote && <small id="customerNote-error" className="field-error">{fieldErrors.customerNote}</small>}</div>
          <button className="button button-dark button-wide" type="submit" disabled={busy}>{busy ? 'Đang gửi yêu cầu…' : <>Gửi yêu cầu đặt bàn <span aria-hidden="true">↗</span></>}</button><p className="form-privacy-note">Thông tin liên hệ chỉ được dùng để trao đổi về yêu cầu đặt bàn này.</p>
        </form>
      </div></div><span className="section-lantern section-lantern--right" aria-hidden="true" /></section></>;
}

const RESOURCES = {
  dishes: { label: 'Món ăn', endpoint: 'dishes', fields: ['name', 'description', 'price', 'categoryId', 'chefId', 'imageUrl', 'ingredientIds', 'isPublished', 'isAvailable', 'isFeatured'], create: { name: '', description: '', price: '', categoryId: '', chefId: '', imageUrl: '', ingredientIds: [], isPublished: false, isAvailable: true, isFeatured: false } },
  chefs: { label: 'Đầu bếp', endpoint: 'chefs', fields: ['name', 'title', 'bio', 'specialty', 'imageUrl', 'sortOrder', 'dishIds', 'isPublished'], create: { name: '', title: '', bio: '', specialty: '', imageUrl: '', sortOrder: '0', dishIds: [], isPublished: false } },
  ingredients: { label: 'Nguyên liệu', endpoint: 'ingredients', fields: ['name'], create: { name: '' } },
  reservations: { label: 'Đặt bàn', endpoint: 'reservations', fields: ['customerName', 'phone', 'email', 'guestCount', 'date', 'time', 'status', 'customerNote', 'adminNote'], create: {} }
};

const ADMIN_LIST_SORTS = {
  dishes: { by: 'updatedAt', direction: 'desc' },
  chefs: { by: 'sortOrder', direction: 'asc' },
  ingredients: { by: 'name', direction: 'asc' },
  reservations: { by: 'startsAt', direction: 'desc' }
};

function SortHeader({ label, field, sortBy, sortDirection, onSort }) {
  const active = sortBy === field;
  return <th scope="col" aria-sort={active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
    <button className="admin-sort-button" type="button" onClick={() => onSort(field)}>
      {label}<span aria-hidden="true">{active ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
    </button>
  </th>;
}

function readAdminDishFilters(params) {
  const categoryIds = [...params.getAll('categoryIds'), ...params.getAll('categoryId')]
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    categoryIds: [...new Set(categoryIds)],
    isPublished: params.get('isPublished') || '',
    isAvailable: params.get('isAvailable') || '',
    isFeatured: params.get('isFeatured') || '',
    minPrice: params.get('minPrice') || '',
    maxPrice: params.get('maxPrice') || ''
  };
}

function AdminDishFilterDialog({ categories, initialFilters, onClose, onApply }) {
  const [draft, setDraft] = React.useState(() => ({ ...initialFilters, categoryIds: [...initialFilters.categoryIds] }));
  const dialogRef = React.useRef(null);
  const closeButtonRef = React.useRef(null);
  const rangeInvalid = draft.minPrice !== '' && draft.maxPrice !== '' && Number(draft.minPrice) > Number(draft.maxPrice);
  const enteredPrice = Math.max(Number(draft.minPrice) || 0, Number(draft.maxPrice) || 0);
  const sliderMax = Math.max(500000, Math.ceil((enteredPrice + 1000) / 50000) * 50000);
  const sliderMinValue = Math.min(Number(draft.minPrice) || 0, sliderMax);
  const sliderMaxValue = Math.max(sliderMinValue, Math.min(draft.maxPrice === '' ? sliderMax : Number(draft.maxPrice), sliderMax));
  const sliderRangeStyle = {
    '--price-range-start': `${(sliderMinValue / sliderMax) * 100}%`,
    '--price-range-end': `${(sliderMaxValue / sliderMax) * 100}%`
  };

  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function toggleCategory(categoryId) {
    setDraft((current) => ({
      ...current,
      categoryIds: current.categoryIds.includes(categoryId)
        ? current.categoryIds.filter((id) => id !== categoryId)
        : [...current.categoryIds, categoryId]
    }));
  }

  function updatePriceSlider(field, value) {
    const price = Number(value);
    if (field === 'minPrice') {
      const upperBound = draft.maxPrice === '' ? sliderMax : Number(draft.maxPrice);
      update(field, String(Math.min(price, upperBound)));
      return;
    }
    const lowerBound = draft.minPrice === '' ? 0 : Number(draft.minPrice);
    update(field, String(Math.max(price, lowerBound)));
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled)')];
    if (!focusable.length) return;
    if (event.shiftKey && document.activeElement === focusable[0]) {
      event.preventDefault();
      focusable.at(-1).focus();
    } else if (!event.shiftKey && document.activeElement === focusable.at(-1)) {
      event.preventDefault();
      focusable[0].focus();
    }
  }

  return createPortal(<div className="admin-filter-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="admin-panel admin-dish-filter-dialog" role="dialog" aria-modal="true" aria-labelledby="dish-filter-title" aria-describedby="dish-filter-description" ref={dialogRef} onKeyDown={handleKeyDown}>
      <header className="admin-dish-filter-dialog__heading">
        <div><p className="eyebrow">DANH SÁCH MÓN</p><h2 id="dish-filter-title">Lọc món ăn</h2><p id="dish-filter-description">Kết hợp nhiều điều kiện để thu hẹp danh sách.</p></div>
        <button className="admin-delete-close" type="button" aria-label="Đóng bộ lọc" onClick={onClose} ref={closeButtonRef}>×</button>
      </header>
      <div className="admin-dish-filter-dialog__body">
        <fieldset className="admin-dish-filter-group admin-dish-filter-group--categories">
          <legend>Danh mục</legend>
          {categories.length ? <div className="admin-dish-filter-categories">{categories.map((category) => <label className="admin-dish-filter-category" key={category.id}>
            <input type="checkbox" checked={draft.categoryIds.includes(category.id)} onChange={() => toggleCategory(category.id)} />
            <span>{category.name}</span>
          </label>)}</div> : <p className="admin-dish-filter-empty">Chưa có danh mục.</p>}
        </fieldset>
        <div className="admin-dish-filter-selects">
          <label className="admin-dish-filter-field" htmlFor="dish-filter-published"><span>Hiển thị</span><select id="dish-filter-published" value={draft.isPublished} onChange={(event) => update('isPublished', event.target.value)}><option value="">Tất cả</option><option value="true">Công khai</option><option value="false">Bản nháp</option></select></label>
          <label className="admin-dish-filter-field" htmlFor="dish-filter-available"><span>Phục vụ</span><select id="dish-filter-available" value={draft.isAvailable} onChange={(event) => update('isAvailable', event.target.value)}><option value="">Tất cả</option><option value="true">Đang phục vụ</option><option value="false">Tạm hết</option></select></label>
          <label className="admin-dish-filter-field" htmlFor="dish-filter-featured"><span>Nổi bật</span><select id="dish-filter-featured" value={draft.isFeatured} onChange={(event) => update('isFeatured', event.target.value)}><option value="">Tất cả</option><option value="true">Món nổi bật</option><option value="false">Không nổi bật</option></select></label>
        </div>
        <fieldset className="admin-dish-filter-group">
          <legend>Khoảng giá (₫)</legend>
          <div className="admin-dish-price-slider" style={sliderRangeStyle}>
            <div className="admin-dish-price-slider__track">
              <input type="range" min="0" max={sliderMax} step="1000" value={sliderMinValue} aria-label="Giá tối thiểu" aria-valuetext={draft.minPrice === '' ? 'Không giới hạn dưới' : money(draft.minPrice)} onChange={(event) => updatePriceSlider('minPrice', event.target.value)} />
              <input type="range" min="0" max={sliderMax} step="1000" value={sliderMaxValue} aria-label="Giá tối đa" aria-valuetext={draft.maxPrice === '' ? 'Không giới hạn trên' : money(draft.maxPrice)} onChange={(event) => updatePriceSlider('maxPrice', event.target.value)} />
            </div>
            <div className="admin-dish-price-slider__labels"><span>0 ₫</span><span>{money(sliderMax)}</span></div>
          </div>
          <div className="admin-dish-filter-prices">
            <label className="admin-dish-filter-field" htmlFor="dish-filter-min-price"><span>Từ</span><input id="dish-filter-min-price" type="number" min="0" max="999999999999" step="1" inputMode="numeric" value={draft.minPrice} onChange={(event) => update('minPrice', event.target.value)} placeholder="Không giới hạn" /></label>
            <label className="admin-dish-filter-field" htmlFor="dish-filter-max-price"><span>Đến</span><input id="dish-filter-max-price" type="number" min="0" max="999999999999" step="1" inputMode="numeric" value={draft.maxPrice} onChange={(event) => update('maxPrice', event.target.value)} placeholder="Không giới hạn" /></label>
          </div>
          {rangeInvalid && <p className="admin-dish-filter-error" role="alert">Giá tối đa phải bằng hoặc lớn hơn giá tối thiểu.</p>}
        </fieldset>
      </div>
      <footer className="admin-dish-filter-dialog__actions">
        <button className="admin-secondary-button" type="button" onClick={() => setDraft({ categoryIds: [], isPublished: '', isAvailable: '', isFeatured: '', minPrice: '', maxPrice: '' })}>Đặt lại</button>
        <div><button className="admin-secondary-button" type="button" onClick={onClose}>Hủy</button><button className="admin-primary-button" type="button" disabled={rangeInvalid} onClick={() => onApply({ ...draft, minPrice: draft.minPrice.trim(), maxPrice: draft.maxPrice.trim() })}>Áp dụng bộ lọc</button></div>
      </footer>
    </section>
  </div>, document.body);
}

function AdminDashboard() {
  const state = useLoad('/api/admin/dashboard');
  if (state.loading) return <Loading />;
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />;
  const counts = state.data.counts;
  return <><section className="admin-page-heading"><div><p className="eyebrow">BẾP HỘI / TỔNG QUAN</p><h1>Chào mừng đến với căn bếp.</h1><p>Quản lý nội dung và các yêu cầu đặt bàn của nhà hàng.</p></div></section>
    <section className="admin-stats-grid" aria-label="Số liệu nhà hàng">{[['Món ăn', counts.dishCount, 'dishes', 'Xem danh sách món'], ['Đầu bếp', counts.chefCount, 'chefs', 'Xem hồ sơ bếp'], ['Nguyên liệu', counts.ingredientCount || 0, 'ingredients', 'Quản lý nguyên liệu'], ['Yêu cầu đặt bàn', counts.reservationCount, 'reservations', 'Xem tất cả yêu cầu']].map(([label, count, route, action]) => <Link className="admin-stat-card" to={`/admin/${route}`} key={route}><span>{label}</span><strong>{count}</strong><small>{action} <span aria-hidden="true">↗</span></small></Link>)}</section>
    <section className="admin-panel"><div className="admin-panel-heading"><div><p className="eyebrow">SẮP TỚI</p><h2>Yêu cầu cần theo dõi</h2></div><Link className="admin-text-link" to="/admin/reservations">Mở danh sách <span aria-hidden="true">↗</span></Link></div>{state.data.upcoming?.length ? <div className="admin-table-wrap" role="region" aria-label="Bảng yêu cầu đặt bàn sắp tới" tabIndex="0"><table className="admin-table"><thead><tr><th>Mã yêu cầu</th><th>Khách</th><th>Thời gian</th><th>Số khách</th><th>Trạng thái</th><th /></tr></thead><tbody>{state.data.upcoming.map((item) => <tr key={item.id}><td><Link className="table-primary-link" to={`/admin/reservations/${item.id}/edit`}>{item.referenceCode}</Link></td><td>{item.customerName}</td><td>{dateTime(item.startsAt)}</td><td>{item.guestCount}</td><td><ReservationStatusBadge status={item.status} /></td><td><Link className="table-action" to={`/admin/reservations/${item.id}/edit`}>Chi tiết</Link></td></tr>)}</tbody></table></div> : <p className="admin-empty">Chưa có yêu cầu sắp tới.</p>}</section>
  </>;
}

function AdminList({ resource }) {
  const config = RESOURCES[resource];
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [notice, setNotice] = React.useState(location.state?.notice || '');
  const [dishFiltersOpen, setDishFiltersOpen] = React.useState(false);
  const dishFilterButtonRef = React.useRef(null);
  const query = params.toString();
  const path = `/api/admin/${config.endpoint}${query ? `?${query}` : ''}`;
  const state = useLoad(path);
  const categoryState = useLoad(resource === 'dishes' ? '/api/admin/categories' : null);
  const [dishCategories, setDishCategories] = React.useState([]);
  React.useEffect(() => {
    if (categoryState.data) setDishCategories(categoryState.data);
  }, [categoryState.data]);
  React.useEffect(() => {
    if (resource !== 'dishes' || params.get('sortBy') !== 'featured') return;
    const next = new URLSearchParams(params);
    next.delete('sortBy');
    next.delete('sortDirection');
    next.delete('page');
    setParams(next, { replace: true });
  }, [params, resource, setParams]);
  React.useEffect(() => {
    if (!location.state?.notice) return;
    setNotice(location.state.notice);
    if (location.state.deletedId) {
      state.mutate((data) => {
        if (!data?.items?.some((item) => item.id === location.state.deletedId)) return data;
        const total = Math.max(0, (data.total ?? data.items.length) - 1);
        return {
          ...data,
          items: data.items.filter((item) => item.id !== location.state.deletedId),
          total,
          pageCount: Math.max(1, Math.ceil(total / (data.pageSize || 10)))
        };
      });
    }
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.key, location.pathname, location.search, location.state, navigate, state.mutate]);
  function filter(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams(params);
    for (const key of ['q', 'status', 'from', 'to']) {
      next.delete(key);
      if (form.get(key)) next.set(key, String(form.get(key)));
    }
    next.delete('page');
    setParams(next);
  }
  function closeDishFilters() {
    setDishFiltersOpen(false);
    window.requestAnimationFrame(() => dishFilterButtonRef.current?.focus());
  }
  function sortByField(field) {
    const defaults = ADMIN_LIST_SORTS[resource];
    const currentSortBy = params.get('sortBy') || state.data?.sortBy || defaults.by;
    const currentSortDirection = params.get('sortDirection') || state.data?.sortDirection || defaults.direction;
    const direction = currentSortBy === field && currentSortDirection === 'asc' ? 'desc' : 'asc';
    const next = new URLSearchParams(params);
    next.set('sortBy', field);
    next.set('sortDirection', direction);
    next.delete('page');
    setParams(next);
  }
  function chooseSortField(field) {
    const next = new URLSearchParams(params);
    if (field !== currentSortBy) next.set('sortDirection', 'asc');
    next.set('sortBy', field);
    next.delete('page');
    setParams(next);
  }
  function toggleSortDirection() {
    const next = new URLSearchParams(params);
    next.set('sortDirection', currentSortDirection === 'asc' ? 'desc' : 'asc');
    next.delete('page');
    setParams(next);
  }
  const result = state.data;
  const rows = result?.items || [];
  const defaults = ADMIN_LIST_SORTS[resource];
  const currentSortBy = params.get('sortBy') || result?.sortBy || defaults.by;
  const currentSortDirection = params.get('sortDirection') || result?.sortDirection || defaults.direction;
  const sortHeader = (label, field) => <SortHeader key={field} label={label} field={field} sortBy={currentSortBy} sortDirection={currentSortDirection} onSort={sortByField} />;
  const filterError = (field) => state.errorCode === 'VALIDATION_FAILED' ? state.fields[field] : '';
  if (resource === 'dishes') {
    const activeDishFilters = readAdminDishFilters(params);
    const selectedCategories = activeDishFilters.categoryIds.map((id) => dishCategories.find((category) => category.id === id)).filter(Boolean);
    const activeFilterCount = [
      activeDishFilters.categoryIds.length > 0,
      activeDishFilters.isPublished !== '',
      activeDishFilters.isAvailable !== '',
      activeDishFilters.isFeatured !== '',
      activeDishFilters.minPrice !== '' || activeDishFilters.maxPrice !== ''
    ].filter(Boolean).length;
    const filterChips = [
      ...activeDishFilters.categoryIds.map((id) => ({ field: 'categoryIds', value: id, label: dishCategories.find((category) => category.id === id)?.name || 'Danh mục' })),
      ...(activeDishFilters.isPublished !== '' ? [{ field: 'isPublished', label: activeDishFilters.isPublished === 'true' ? 'Công khai' : 'Bản nháp' }] : []),
      ...(activeDishFilters.isAvailable !== '' ? [{ field: 'isAvailable', label: activeDishFilters.isAvailable === 'true' ? 'Đang phục vụ' : 'Tạm hết' }] : []),
      ...(activeDishFilters.isFeatured !== '' ? [{ field: 'isFeatured', label: activeDishFilters.isFeatured === 'true' ? 'Món nổi bật' : 'Không nổi bật' }] : []),
      ...((activeDishFilters.minPrice !== '' || activeDishFilters.maxPrice !== '') ? [{
        field: 'priceRange',
        label: activeDishFilters.minPrice !== '' && activeDishFilters.maxPrice !== ''
          ? `Giá: ${money(activeDishFilters.minPrice)} – ${money(activeDishFilters.maxPrice)}`
          : activeDishFilters.minPrice !== '' ? `Giá từ ${money(activeDishFilters.minPrice)}` : `Giá đến ${money(activeDishFilters.maxPrice)}`
      }] : [])
    ];
    function applyDishFilters(filters) {
      const next = new URLSearchParams(params);
      for (const key of ['categoryId', 'categoryIds', 'isPublished', 'isAvailable', 'isFeatured', 'minPrice', 'maxPrice']) next.delete(key);
      if (filters.categoryIds.length) next.set('categoryIds', filters.categoryIds.join(','));
      for (const key of ['isPublished', 'isAvailable', 'isFeatured', 'minPrice', 'maxPrice']) {
        if (filters[key] !== '') next.set(key, filters[key]);
      }
      next.delete('page');
      setParams(next);
      closeDishFilters();
    }
    function removeDishFilter(field, value) {
      const next = new URLSearchParams(params);
      if (field === 'categoryIds') {
        const remaining = activeDishFilters.categoryIds.filter((id) => id !== value);
        next.delete('categoryId');
        next.delete('categoryIds');
        if (remaining.length) next.set('categoryIds', remaining.join(','));
      } else if (field === 'priceRange') {
        next.delete('minPrice');
        next.delete('maxPrice');
      } else {
        next.delete(field);
      }
      next.delete('page');
      setParams(next);
    }
    function clearDishFilters() {
      applyDishFilters({ categoryIds: [], isPublished: '', isAvailable: '', isFeatured: '', minPrice: '', maxPrice: '' });
    }
    const addCategory = (category) => {
      setDishCategories((current) => [...current.filter((item) => item.id !== category.id), category]);
    };
    const updateCategory = (category) => setDishCategories((current) => current.map((item) => item.id === category.id ? category : item));
    const removeCategory = (categoryId) => {
      setDishCategories((current) => current.filter((item) => item.id !== categoryId));
      if (activeDishFilters.categoryIds.includes(categoryId)) {
        applyDishFilters({ ...activeDishFilters, categoryIds: activeDishFilters.categoryIds.filter((id) => id !== categoryId) });
      }
    };
    const categoryHeading = selectedCategories.length === 1 ? selectedCategories[0].name : selectedCategories.length ? `${selectedCategories.length} danh mục đã chọn` : 'Tất cả món ăn';
    return <><section className="admin-page-heading"><div><p className="eyebrow">NỘI DUNG / QUẢN TRỊ</p><h1>Món ăn</h1><p>{result?.total ?? 0} món trong danh mục quản trị.</p></div><Link className="admin-primary-button" to="/admin/dishes/new">+ Thêm món ăn</Link></section>
      <section className="admin-panel admin-panel--dishes">
        {categoryState.loading ? <Loading label="Đang tải danh mục món…" /> : categoryState.error ? <ErrorState message={categoryState.error} onRetry={categoryState.reload} /> : <div className="admin-dish-browser">
          <CategoryManager categories={dishCategories} onCreated={addCategory} onUpdated={updateCategory} onDeleted={removeCategory} selectable={false} title="Quản lý danh mục" createdMessage="vào danh sách danh mục." />
          <section className="admin-dish-results" aria-labelledby="admin-dish-results-title">
            <header className="admin-dish-results__heading"><div><p className="eyebrow">DANH SÁCH MÓN</p><h2 id="admin-dish-results-title">{categoryHeading}</h2><p>{result?.total ?? 0} món{selectedCategories.length ? ` thuộc ${selectedCategories.length} danh mục đã chọn` : ''}</p></div><span className="admin-count">{result?.total ?? 0} mục</span></header>
            <form className="admin-search admin-dish-search" onSubmit={filter} role="search" aria-label="Tìm món ăn"><div className="admin-search-field"><label htmlFor="adminSearch">Tìm món ăn</label><input id="adminSearch" type="search" name="q" defaultValue={params.get('q') || ''} placeholder="Tên món, nguyên liệu, đầu bếp…" /></div><button className="admin-primary-button" type="submit" disabled={state.loading}>Tìm kiếm</button></form>
            <div className="admin-dish-sortbar" aria-label="Lọc và sắp xếp danh sách món ăn">
              <button className="admin-dish-filter-trigger" type="button" aria-haspopup="dialog" aria-expanded={dishFiltersOpen} aria-label={activeFilterCount ? `Bộ lọc món ăn, ${activeFilterCount} nhóm đang áp dụng` : 'Bộ lọc món ăn'} onClick={() => setDishFiltersOpen(true)} ref={dishFilterButtonRef}><span aria-hidden="true">☷</span> Bộ lọc{activeFilterCount > 0 && <span className="admin-dish-filter-count">{activeFilterCount}</span>}</button>
              <span>Sắp xếp món ăn</span>
              <label className="admin-dish-sort"><span className="visually-hidden">Tiêu chí sắp xếp</span><select value={currentSortBy} onChange={(event) => chooseSortField(event.target.value)} aria-label="Sắp xếp món ăn theo"><option value="updatedAt">Cập nhật gần đây</option><option value="name">Tên món</option><option value="category">Danh mục</option><option value="price">Giá bán</option><option value="visibility">Hiển thị</option><option value="availability">Phục vụ</option></select></label>
              <button className="admin-dish-sort-direction" type="button" onClick={toggleSortDirection} aria-label={`Đổi thứ tự sắp xếp ${currentSortDirection === 'asc' ? 'giảm dần' : 'tăng dần'}`}>{currentSortDirection === 'asc' ? '↑ Tăng dần' : '↓ Giảm dần'}</button>
            </div>
            {filterChips.length > 0 && <div className="admin-dish-active-filters" aria-label="Bộ lọc đang áp dụng"><span>Đang lọc:</span>{filterChips.map((chip) => <button className="admin-dish-filter-chip" type="button" key={`${chip.field}-${chip.value || chip.label}`} onClick={() => removeDishFilter(chip.field, chip.value)} aria-label={`Bỏ bộ lọc ${chip.label}`}>{chip.label}<span aria-hidden="true">×</span></button>)}<button className="admin-dish-filter-clear" type="button" onClick={clearDishFilters}>Xóa tất cả</button></div>}
            {notice && <div className="admin-notice" role="status"><span>{notice}</span><button className="admin-notice-dismiss" type="button" aria-label="Đóng thông báo" onClick={() => setNotice('')}>×</button></div>}
            {state.loading ? <Loading /> : state.error ? <ErrorState message={state.error} onRetry={state.reload} /> : rows.length ? <AdminDishCards rows={rows} categories={dishCategories} location={location} params={params} setParams={setParams} result={result} /> : <p className="admin-empty">{params.get('q') ? 'Không tìm thấy món ăn phù hợp.' : 'Danh mục này chưa có món ăn.'}</p>}
          </section>
          {dishFiltersOpen && <AdminDishFilterDialog categories={dishCategories} initialFilters={activeDishFilters} onClose={closeDishFilters} onApply={applyDishFilters} />}
        </div>}
      </section>
    </>;
  }
  if (resource === 'chefs') {
    return <><section className="admin-page-heading"><div><p className="eyebrow">NỘI DUNG / QUẢN TRỊ</p><h1>Đầu bếp</h1><p>{result?.total ?? 0} hồ sơ trong danh mục quản trị.</p></div><Link className="admin-primary-button" to="/admin/chefs/new">+ Thêm đầu bếp</Link></section>
      <section className="admin-panel admin-panel--chefs">
        <header className="admin-panel-heading"><div><p className="eyebrow">DANH SÁCH</p><h2>Người giữ bếp</h2></div><span className="admin-count">{result?.total ?? 0} mục</span></header>
        <form className="admin-search" onSubmit={filter} role="search" aria-label="Tìm đầu bếp"><div className="admin-search-field"><label htmlFor="adminSearch">Tìm đầu bếp</label><input id="adminSearch" type="search" name="q" defaultValue={params.get('q') || ''} placeholder="Tên, chức danh, sở trường…" /></div><button className="admin-primary-button" type="submit" disabled={state.loading}>Tìm kiếm</button></form>
        {notice && <div className="admin-notice" role="status"><span>{notice}</span><button className="admin-notice-dismiss" type="button" aria-label="Đóng thông báo" onClick={() => setNotice('')}>×</button></div>}
        {state.loading ? <Loading /> : state.error && state.errorCode !== 'VALIDATION_FAILED' ? <ErrorState message={state.error} onRetry={state.reload} /> : state.error ? <p className="api-error" role="alert">{state.error}</p> : rows.length ? <AdminChefCards rows={rows} result={result} location={location} params={params} setParams={setParams} sortBy={currentSortBy} sortDirection={currentSortDirection} onSortBy={chooseSortField} onToggleSort={toggleSortDirection} /> : <p className="admin-empty">{params.get('q') ? 'Không tìm thấy đầu bếp phù hợp.' : 'Chưa có hồ sơ đầu bếp nào.'}</p>}
      </section>
    </>;
  }
  return <><section className="admin-page-heading"><div><p className="eyebrow">NỘI DUNG / {resource === 'reservations' ? 'DỊCH VỤ' : 'QUẢN TRỊ'}</p><h1>{config.label === 'Đặt bàn' ? 'Yêu cầu đặt bàn' : config.label}</h1><p>{resource === 'reservations' ? 'Khách gửi yêu cầu trước; nhà hàng cần liên hệ để xác nhận.' : `${result?.total ?? 0} mục trong danh mục quản trị.`}</p></div>{resource !== 'reservations' && <Link className="admin-primary-button" to={`/admin/${resource}/new`}>+ Thêm {config.label.toLowerCase()}</Link>}</section>
    <section className={`admin-panel${resource === 'ingredients' ? ' admin-panel--ingredients' : ''}`}><div className="admin-panel-heading"><div><p className="eyebrow">DANH SÁCH</p><h2>{resource === 'chefs' ? 'Người giữ bếp' : `Tất cả ${config.label.toLowerCase()}`}</h2></div><span className="admin-count">{result?.total ?? 0} mục</span></div>
    <form className="admin-search" onSubmit={filter} role="search" aria-label={`Tìm ${config.label.toLowerCase()}`}><div className="admin-search-field"><label htmlFor="adminSearch">{resource === 'reservations' ? 'Tìm yêu cầu đặt bàn' : `Tìm ${config.label.toLowerCase()}`}</label><input id="adminSearch" type="search" name="q" defaultValue={params.get('q') || ''} placeholder={`Tên, thông tin ${config.label.toLowerCase()}…`} /></div>{resource === 'reservations' && <><div className="admin-filters"><div className="form-field"><label htmlFor="statusFilter">Trạng thái</label><select id="statusFilter" name="status" defaultValue={params.get('status') || ''} aria-invalid={Boolean(filterError('status'))} aria-describedby={filterError('status') ? 'statusFilter-error' : undefined}><option value="">Tất cả trạng thái</option>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{filterError('status') && <small id="statusFilter-error" className="field-error">{filterError('status')}</small>}</div><div className="form-field"><label htmlFor="fromFilter">Từ ngày</label><input id="fromFilter" type="date" name="from" defaultValue={params.get('from') || ''} aria-invalid={Boolean(filterError('from'))} aria-describedby={filterError('from') ? 'fromFilter-error' : undefined} />{filterError('from') && <small id="fromFilter-error" className="field-error">{filterError('from')}</small>}</div><div className="form-field"><label htmlFor="toFilter">Đến ngày</label><input id="toFilter" type="date" name="to" defaultValue={params.get('to') || ''} aria-invalid={Boolean(filterError('to'))} aria-describedby={filterError('to') ? 'toFilter-error' : undefined} />{filterError('to') && <small id="toFilter-error" className="field-error">{filterError('to')}</small>}</div></div></>}<button className="admin-primary-button" type="submit" disabled={state.loading}>Tìm kiếm</button></form>
    {notice && <div className="admin-notice" role="status"><span>{notice}</span><button className="admin-notice-dismiss" type="button" aria-label="Đóng thông báo" onClick={() => setNotice('')}>×</button></div>}{state.loading ? <Loading /> : state.error && state.errorCode !== 'VALIDATION_FAILED' ? <ErrorState message={state.error} onRetry={state.reload} /> : state.error ? <p className="api-error" role="alert">{state.error}</p> : rows.length ? (resource === 'ingredients' ? <AdminIngredientCards rows={rows} result={result} sortDirection={currentSortDirection} onSort={() => sortByField('name')} location={location} params={params} setParams={setParams} /> : <><div className="admin-table-wrap" role="region" aria-label={`Bảng ${config.label.toLowerCase()}`} tabIndex="0"><table className={`admin-table admin-table--${resource}`}><thead><tr>
      {resource === 'dishes' && <>{sortHeader('Món ăn', 'name')}{sortHeader('Danh mục', 'category')}{sortHeader('Giá', 'price')}<th scope="col">Đầu bếp</th>{sortHeader('Hiển thị', 'visibility')}{sortHeader('Phục vụ', 'availability')}{sortHeader('Cập nhật', 'updatedAt')}<th className="admin-actions-heading" scope="col">Thao tác</th></>}
      {resource === 'chefs' && <>{sortHeader('Họ tên', 'name')}{sortHeader('Chức danh', 'title')}{sortHeader('Sở trường', 'specialty')}<th scope="col">Món phụ trách</th>{sortHeader('Thứ tự', 'sortOrder')}{sortHeader('Hiển thị', 'visibility')}<th className="admin-actions-heading" scope="col">Thao tác</th></>}
      {resource === 'reservations' && <>{sortHeader('Mã yêu cầu', 'referenceCode')}{sortHeader('Khách', 'customerName')}<th scope="col">Điện thoại</th>{sortHeader('Thời gian', 'startsAt')}{sortHeader('Số khách', 'guestCount')}{sortHeader('Trạng thái', 'status')}<th className="admin-actions-heading" scope="col">Thao tác</th></>}
    </tr></thead><tbody>
      {resource === 'dishes' && rows.map((dish) => <tr key={dish.id}><td><Link className="table-primary-link" to={`/admin/dishes/${dish.id}/edit`}>{dish.name}</Link><small className="table-subline">ID: {dish.id}</small></td><td>{dish.category?.name || '—'}</td><td>{money(dish.price)}</td><td>{dish.chef?.name || 'Chưa gán đầu bếp'}</td><td><span className={`status-badge ${dish.isPublished ? 'status-confirmed' : 'status-cancelled'}`}>{dish.isPublished ? 'Đã công khai' : 'Bản nháp'}</span></td><td>{dish.isAvailable ? 'Đang có' : 'Tạm hết'}{dish.isFeatured ? ' · Nổi bật' : ''}</td><td>{dateTime(dish.updatedAt)}</td><td className="admin-actions-cell"><AdminRowActions resource={resource} row={dish} returnTo={`${location.pathname}${location.search}`} backgroundLocation={location} /></td></tr>)}
      {resource === 'chefs' && rows.map((chef) => <tr key={chef.id}><td><Link className="table-primary-link" to={`/admin/chefs/${chef.id}/edit`}>{chef.name}</Link></td><td>{chef.title}</td><td>{chef.specialty || '—'}</td><td>{chef.dishes?.length ? chef.dishes.map((dish) => dish.name).join(', ') : 'Chưa gán món'}</td><td>{chef.sortOrder}</td><td><span className={`status-badge ${chef.isPublished ? 'status-confirmed' : 'status-cancelled'}`}>{chef.isPublished ? 'Công khai' : 'Bản nháp'}</span></td><td className="admin-actions-cell"><AdminRowActions resource={resource} row={chef} returnTo={`${location.pathname}${location.search}`} backgroundLocation={location} /></td></tr>)}
      {resource === 'reservations' && rows.map((reservation) => <tr key={reservation.id}><td><Link className="table-primary-link" to={`/admin/reservations/${reservation.id}/edit`}>{reservation.referenceCode}</Link></td><td>{reservation.customerName}</td><td><a href={`tel:${reservation.phone}`}>{reservation.phone}</a></td><td>{dateTime(reservation.startsAt)}</td><td>{reservation.guestCount}</td><td><ReservationStatusBadge status={reservation.status} /></td><td className="admin-actions-cell"><AdminRowActions resource={resource} row={reservation} returnTo={`${location.pathname}${location.search}`} backgroundLocation={location} /></td></tr>)}
    </tbody></table></div><Pagination result={result} params={params} setParams={setParams} /></>) : <p className="admin-empty">{params.get('q') ? `Không tìm thấy ${config.label.toLowerCase()} phù hợp.` : `Chưa có ${config.label.toLowerCase()} nào.`}</p>}
    </section>
  </>;
}

function AdminIngredientCards({ rows, result, sortDirection, onSort, location, params, setParams }) {
  return <>
    <div className="admin-ingredient-toolbar">
      <span>Đang hiển thị {rows.length} / {result.total}</span>
      <button className="admin-sort-button admin-ingredient-sort" type="button" onClick={onSort} aria-label={`Sắp xếp tên ${sortDirection === 'asc' ? 'từ Z đến A' : 'từ A đến Z'}`}>
        Tên {sortDirection === 'asc' ? 'A–Z' : 'Z–A'} <span aria-hidden="true">{sortDirection === 'asc' ? '↑' : '↓'}</span>
      </button>
    </div>
    <div className="admin-ingredient-grid" role="list" aria-label="Danh sách nguyên liệu">
      {rows.map((ingredient) => {
        const dishCount = ingredient._count?.dishes ?? 0;
        return <article className="admin-ingredient-card" role="listitem" aria-label={`${ingredient.name}, dùng trong ${dishCount} món`} key={ingredient.id}>
          <div className="admin-ingredient-card__heading">
            <h3>{ingredient.name}</h3>
            <span className={`admin-ingredient-status ${dishCount ? 'is-used' : 'is-unused'}`}>{dishCount ? 'Đang dùng' : 'Chưa dùng'}</span>
          </div>
          <div className="admin-ingredient-card__footer">
            <span>{dishCount} món ăn</span>
            <AdminRowActions resource="ingredients" row={ingredient} returnTo={`${location.pathname}${location.search}`} backgroundLocation={location} />
          </div>
        </article>;
      })}
    </div>
    <Pagination result={result} params={params} setParams={setParams} />
  </>;
}

function AdminDishCards({ rows, categories, location, params, setParams, result }) {
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  return <>
    <div className="admin-dish-card-list" role="list" aria-label="Danh sách món ăn">
      {rows.map((dish) => {
        const category = categoriesById.get(dish.categoryId) || dish.category;
        return <article className="admin-dish-card" role="listitem" key={dish.id}>
          <Link className="admin-dish-card__image" to={`/admin/dishes/${dish.id}/edit`} aria-label={`Chỉnh sửa ${dish.name}`}>
            <img src={dish.imageUrl || FALLBACK} alt="" loading="lazy" onError={(event) => { event.currentTarget.src = FALLBACK; }} />
          </Link>
          <div className="admin-dish-card__content">
            <div className="admin-dish-card__title"><h3><Link to={`/admin/dishes/${dish.id}/edit`}>{dish.name}</Link></h3><strong>{money(dish.price)}</strong></div>
            <p className="admin-dish-card__description">{dish.description || 'Chưa có mô tả cho món ăn này.'}</p>
            <p className="admin-dish-card__meta">{category?.name || 'Chưa phân loại'}{dish.chef?.name ? ` · ${dish.chef.name}` : ''}</p>
            <div className="admin-dish-card__statuses"><span className={`status-badge ${dish.isPublished ? 'status-confirmed' : 'status-cancelled'}`}>{dish.isPublished ? 'Đã công khai' : 'Bản nháp'}</span><span className={`status-badge ${dish.isAvailable ? 'status-confirmed' : 'status-pending'}`}>{dish.isAvailable ? 'Đang phục vụ' : 'Tạm hết'}</span>{dish.isFeatured && <span className="admin-dish-featured">Nổi bật</span>}</div>
          </div>
          <div className="admin-dish-card__actions"><AdminRowActions resource="dishes" row={dish} returnTo={`${location.pathname}${location.search}`} backgroundLocation={location} /></div>
        </article>;
      })}
    </div>
    <Pagination result={result} params={params} setParams={setParams} />
  </>;
}

function AdminChefCards({ rows, result, location, params, setParams, sortBy, sortDirection, onSortBy, onToggleSort }) {
  return <>
    <div className="admin-chef-toolbar">
      <span>Đang hiển thị {rows.length} / {result.total}</span>
      <label className="admin-chef-sort"><span>Sắp xếp</span><select value={sortBy} onChange={(event) => onSortBy(event.target.value)} aria-label="Sắp xếp hồ sơ đầu bếp theo">
        <option value="sortOrder">Thứ tự</option><option value="name">Họ tên</option><option value="title">Chức danh</option><option value="specialty">Sở trường</option><option value="visibility">Hiển thị</option>
      </select><button className="admin-chef-sort-direction" type="button" onClick={onToggleSort} aria-label={`Đổi thứ tự sắp xếp ${sortDirection === 'asc' ? 'giảm dần' : 'tăng dần'}`}>{sortDirection === 'asc' ? '↑ Tăng dần' : '↓ Giảm dần'}</button></label>
    </div>
    <div className="admin-chef-card-grid" role="list" aria-label="Danh sách hồ sơ đầu bếp">
      {rows.map((chef) => <article className="admin-chef-card" role="listitem" key={chef.id}>
        <img className="admin-chef-card__image" src={chef.imageUrl || FALLBACK} alt={`Chân dung ${chef.name}`} loading="lazy" onError={(event) => { event.currentTarget.src = FALLBACK; }} />
        <div className="admin-chef-card__content">
          <div className="admin-chef-card__heading"><div><h3>{chef.name}</h3><p>{chef.title}</p></div><span className={`status-badge ${chef.isPublished ? 'status-confirmed' : 'status-cancelled'}`}>{chef.isPublished ? 'Công khai' : 'Bản nháp'}</span></div>
          {chef.specialty && <p className="admin-chef-card__specialty">{chef.specialty}</p>}
          {chef.bio && <p className="admin-chef-card__bio">{chef.bio}</p>}
          <p className="admin-chef-card__dishes"><strong>{chef.dishes?.length || 0} món phụ trách</strong>{chef.dishes?.length ? ` · ${chef.dishes.map((dish) => dish.name).join(', ')}` : ''}</p>
        </div>
        <footer className="admin-chef-card__actions"><span>Thứ tự {chef.sortOrder}</span><AdminRowActions resource="chefs" row={chef} returnTo={`${location.pathname}${location.search}`} backgroundLocation={location} /></footer>
      </article>)}
    </div>
    <Pagination result={result} params={params} setParams={setParams} />
  </>;
}

function AdminRowActions({ resource, row, returnTo, backgroundLocation }) {
  return <div className="admin-row-actions"><Link className="table-action" to={`/admin/${resource}/${row.id}/edit`}>Sửa</Link><Link className="table-action admin-row-delete" to={`/admin/${resource}/${row.id}/delete`} state={{ from: returnTo, backgroundLocation }}>Xóa</Link></div>;
}

function pathFor(resource) { return `/api/admin/${RESOURCES[resource].endpoint}`; }

function Pagination({ result, params, setParams }) {
  if (!result || result.pageCount <= 1) return null;
  function move(page) { const next = new URLSearchParams(params); next.set('page', String(page)); setParams(next); }
  return <nav className="pagination" aria-label="Phân trang"><button className="admin-secondary-button" disabled={result.page <= 1} onClick={() => move(result.page - 1)}>← Trước</button><span>Trang {result.page} / {result.pageCount} · {result.total} mục</span><button className="admin-secondary-button" disabled={result.page >= result.pageCount} onClick={() => move(result.page + 1)}>Sau →</button></nav>;
}

function AdminForm({ resource }) {
  const config = RESOURCES[resource];
  const { id } = useParams();
  const navigate = useNavigate();
  const state = useLoad(id ? `${pathFor(resource)}/${id}` : null);
  const optionsState = useLoad(resource === 'dishes' ? '/api/admin/dishes/options' : resource === 'chefs' ? '/api/admin/chefs/options' : null);
  const [form, setForm] = React.useState(config.create);
  const [categoryOptions, setCategoryOptions] = React.useState(null);
  const [initialized, setInitialized] = React.useState(!id);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState({});
  React.useEffect(() => {
    if (optionsState.data?.categories) setCategoryOptions(optionsState.data.categories);
  }, [optionsState.data?.categories]);
  React.useEffect(() => {
    if (!id || !state.data || initialized) return;
    const item = state.data;
    if (resource === 'dishes') setForm({ ...item, price: String(item.price), chefId: item.chefId || '', ingredientIds: item.ingredients?.map((link) => link.ingredientId) || [] });
    else if (resource === 'reservations') setForm({ ...item, ...dateTimeInputs(item.startsAt), guestCount: String(item.guestCount), email: item.email || '', customerNote: item.customerNote || '', adminNote: item.adminNote || '' });
    else if (resource === 'chefs') setForm({ ...item, bio: item.bio || '', specialty: item.specialty || '', imageUrl: item.imageUrl || '', sortOrder: String(item.sortOrder ?? 0), dishIds: item.dishes?.map((dish) => dish.id) || [] });
    else setForm({ ...item, bio: item.bio || '', specialty: item.specialty || '', imageUrl: item.imageUrl || '', sortOrder: String(item.sortOrder ?? 0) });
    setInitialized(true);
  }, [id, state.data, initialized, resource]);
  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => current[field] ? clearFieldError(current, field) : current);
    setError('');
  }
  function categoryCreated(category) {
    setCategoryOptions((current) => {
      const items = current ?? optionsState.data?.categories ?? [];
      return items.some((item) => item.id === category.id) ? items : [...items, category];
    });
    change('categoryId', category.id);
  }
  function categoryUpdated(category) {
    setCategoryOptions((current) => (current ?? optionsState.data?.categories ?? []).map((item) => item.id === category.id ? category : item));
  }
  function categoryDeleted(categoryId) {
    const remaining = (categoryOptions ?? optionsState.data?.categories ?? []).filter((item) => item.id !== categoryId);
    setCategoryOptions(remaining);
    if (form.categoryId === categoryId) change('categoryId', remaining[0]?.id || '');
  }
  function toggleIngredient(ingredientId) { change('ingredientIds', form.ingredientIds.includes(ingredientId) ? form.ingredientIds.filter((item) => item !== ingredientId) : [...form.ingredientIds, ingredientId]); }
  async function submit(event) {
    event.preventDefault(); setError(''); setFieldErrors({}); setBusy(true);
    try {
      await api(id ? `${pathFor(resource)}/${id}` : pathFor(resource), { method: id ? 'PATCH' : 'POST', body: form });
      navigate(`/admin/${resource}`);
    } catch (requestError) { setError(requestError.message); setFieldErrors(requestError.fields || {}); }
    finally { setBusy(false); }
  }
  if (id && state.loading) return <Loading />;
  if (id && state.error) return <ErrorState message={state.error} />;
  if (['dishes', 'chefs'].includes(resource) && optionsState.loading) return <Loading label={resource === 'dishes' ? 'Đang tải danh mục và nguyên liệu…' : 'Đang tải danh sách món…'} />;
  if (['dishes', 'chefs'].includes(resource) && optionsState.error) return <ErrorState message={optionsState.error} onRetry={optionsState.reload} />;
  const options = optionsState.data || { categories: [], ingredients: [], chefs: [], dishes: [] };
  const categories = categoryOptions ?? options.categories;
  return <><section className="admin-page-heading"><div><p className="eyebrow">NỘI DUNG / BIỂU MẪU</p><h1>{id ? 'Cập nhật' : 'Thêm'} {config.label.toLowerCase()}</h1><p>Thông tin sẽ được kiểm tra trước khi lưu.</p></div><Link className="admin-secondary-button" to={`/admin/${resource}`}>← Danh sách {config.label.toLowerCase()}</Link></section>
    <section className={`admin-panel admin-form-panel${resource === 'dishes' ? ' admin-form-panel--dish' : ''}`}>{error && <div className="form-error-summary" role="alert" aria-live="polite"><strong>Không thể lưu thay đổi:</strong><p>{error}</p></div>}
    <div className={resource === 'dishes' ? 'admin-dish-editor-layout' : undefined}><form className={`admin-form${resource === 'dishes' ? ' admin-dish-main-form' : ''}`} onSubmit={submit}>
      <div className="admin-form-grid">
        {resource === 'dishes' && <>
          <AdminField id="name" label="Tên món" required error={fieldErrors.name}><input id="name" required maxLength="120" value={form.name || ''} onChange={(e) => change('name', e.target.value)} /></AdminField>
          <AdminField id="categoryId" label="Danh mục" required error={fieldErrors.categoryId}><select id="categoryId" required value={form.categoryId || ''} onChange={(e) => change('categoryId', e.target.value)}><option value="">Chọn danh mục</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></AdminField>
          <AdminField id="description" label="Mô tả" wide required error={fieldErrors.description}><textarea id="description" required maxLength="2400" rows="4" value={form.description || ''} onChange={(e) => change('description', e.target.value)} /></AdminField>
          <AdminField id="price" label="Giá nguyên VND" required error={fieldErrors.price}><div className="input-suffix"><input id="price" type="number" min="0" max="999999999999" step="1" inputMode="numeric" required value={form.price || ''} onChange={(e) => change('price', e.target.value)} /><span>₫</span></div></AdminField>
          <AdminField id="imageUrl" label="Đường dẫn ảnh" error={fieldErrors.imageUrl}><input id="imageUrl" type="url" maxLength="2048" value={form.imageUrl || ''} onChange={(e) => change('imageUrl', e.target.value)} placeholder="https://…" /></AdminField>
          <AdminField id="chefId" label="Đầu bếp" error={fieldErrors.chefId}><select id="chefId" value={form.chefId || ''} onChange={(e) => change('chefId', e.target.value)}><option value="">Chưa gán đầu bếp</option>{options.chefs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></AdminField>
          <IngredientPicker ingredients={options.ingredients} selected={form.ingredientIds} error={fieldErrors.ingredientIds} onToggle={toggleIngredient} />
          <fieldset className="checkbox-fieldset form-field-wide"><legend>Trạng thái món ăn</legend><CheckField label="Công khai trên website" description="Món chưa công khai không xuất hiện ở trang khách." value={form.isPublished} onChange={(v) => change('isPublished', v)} /><CheckField label="Đang phục vụ" description="Món tạm hết vẫn có thể hiển thị nhãn trên thực đơn." value={form.isAvailable} onChange={(v) => change('isAvailable', v)} /><CheckField label="Món nổi bật" description="Món nổi bật có thể xuất hiện trên trang chủ." value={form.isFeatured} onChange={(v) => change('isFeatured', v)} /></fieldset>
        </>}
        {resource === 'chefs' && <>
          <AdminField id="name" label="Họ tên" required error={fieldErrors.name}><input id="name" required maxLength="120" value={form.name || ''} onChange={(e) => change('name', e.target.value)} /></AdminField><AdminField id="title" label="Chức danh" required error={fieldErrors.title}><input id="title" required maxLength="140" value={form.title || ''} onChange={(e) => change('title', e.target.value)} /></AdminField>
          <AdminField id="bio" label="Tiểu sử" wide error={fieldErrors.bio}><textarea id="bio" maxLength="2400" rows="4" value={form.bio || ''} onChange={(e) => change('bio', e.target.value)} /></AdminField><AdminField id="specialty" label="Sở trường" error={fieldErrors.specialty}><input id="specialty" maxLength="180" value={form.specialty || ''} onChange={(e) => change('specialty', e.target.value)} /></AdminField><AdminField id="chefImage" label="Đường dẫn ảnh" error={fieldErrors.imageUrl}><input id="chefImage" type="url" maxLength="2048" value={form.imageUrl || ''} onChange={(e) => change('imageUrl', e.target.value)} /></AdminField><AdminField id="sortOrder" label="Thứ tự hiển thị" error={fieldErrors.sortOrder}><input id="sortOrder" type="number" min="0" max="100000" value={form.sortOrder ?? '0'} onChange={(e) => change('sortOrder', e.target.value)} /></AdminField>
          <DishAssignmentPicker dishes={options.dishes} selected={form.dishIds || []} error={fieldErrors.dishIds} onToggle={(dishId) => change('dishIds', form.dishIds.includes(dishId) ? form.dishIds.filter((item) => item !== dishId) : [...form.dishIds, dishId])} />
          <fieldset className="checkbox-fieldset form-field-wide"><legend>Trạng thái hồ sơ</legend><CheckField label="Công khai hồ sơ" value={form.isPublished} onChange={(v) => change('isPublished', v)} /></fieldset>
        </>}
        {resource === 'ingredients' && <AdminField id="name" label="Tên nguyên liệu" required error={fieldErrors.name}><input id="name" required maxLength="100" value={form.name || ''} onChange={(e) => change('name', e.target.value)} /></AdminField>}
        {resource === 'reservations' && <>
          <AdminField id="customerName" label="Họ tên khách" required error={fieldErrors.customerName}><input id="customerName" required maxLength="120" value={form.customerName || ''} onChange={(e) => change('customerName', e.target.value)} /></AdminField><AdminField id="phone" label="Điện thoại" required error={fieldErrors.phone}><input id="phone" required maxLength="40" value={form.phone || ''} onChange={(e) => change('phone', e.target.value)} /></AdminField><AdminField id="email" label="Email" error={fieldErrors.email}><input id="email" type="email" maxLength="254" value={form.email || ''} onChange={(e) => change('email', e.target.value)} /></AdminField><AdminField id="date" label="Ngày đến" required error={fieldErrors.date}><input id="date" required type="date" value={form.date || ''} onChange={(e) => change('date', e.target.value)} /></AdminField><AdminField id="time" label="Giờ đến" required error={fieldErrors.time}><input id="time" required type="time" value={form.time || ''} onChange={(e) => change('time', e.target.value)} /></AdminField><AdminField id="guestCount" label="Số khách" required error={fieldErrors.guestCount}><input id="guestCount" required type="number" min="1" max="12" value={form.guestCount || ''} onChange={(e) => change('guestCount', e.target.value)} /></AdminField><AdminField id="status" label="Trạng thái" error={fieldErrors.status}><select id="status" value={form.status || 'PENDING'} onChange={(e) => change('status', e.target.value)}>{Object.entries(STATUS_LABEL).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></AdminField><AdminField id="customerNote" label="Lời nhắn của khách" wide error={fieldErrors.customerNote}><textarea id="customerNote" rows="3" maxLength="1200" value={form.customerNote || ''} onChange={(e) => change('customerNote', e.target.value)} /></AdminField><AdminField id="adminNote" label="Ghi chú nội bộ" wide error={fieldErrors.adminNote}><textarea id="adminNote" rows="3" maxLength="1200" value={form.adminNote || ''} onChange={(e) => change('adminNote', e.target.value)} /></AdminField><p className="form-field-wide field-help">Mã yêu cầu: {form.referenceCode}</p>
        </>}
      </div>
      <div className="admin-form-actions"><button className="admin-primary-button" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu thay đổi'}</button><Link className="admin-secondary-button" to={`/admin/${resource}`}>Hủy</Link></div>
    </form>{resource === 'dishes' && <CategoryManager categories={categories} selectedId={form.categoryId} onSelect={(categoryId) => change('categoryId', categoryId)} onCreated={categoryCreated} onUpdated={categoryUpdated} onDeleted={categoryDeleted} />}</div></section>
  </>;
}

function CategoryManager({ categories, selectedId, onSelect, onCreated, onUpdated, onDeleted, allowAll = false, selectable = true, title = 'Danh mục món', createdMessage = 'và chọn cho món này.' }) {
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [menuFor, setMenuFor] = React.useState('');
  const [editing, setEditing] = React.useState(null);
  const [editName, setEditName] = React.useState('');
  const [actionBusy, setActionBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState('');
  const [deleteTarget, setDeleteTarget] = React.useState(null);
  const deleteDialogRef = React.useRef(null);

  React.useEffect(() => {
    if (deleteTarget) deleteDialogRef.current?.querySelector('button:not(:disabled)')?.focus();
  }, [deleteTarget]);
  React.useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  React.useEffect(() => {
    if (!menuFor) return undefined;
    function dismissMenu(event) {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && event.target.closest?.('.admin-category-actions')) return;
      setMenuFor('');
    }
    document.addEventListener('pointerdown', dismissMenu);
    document.addEventListener('keydown', dismissMenu);
    return () => {
      document.removeEventListener('pointerdown', dismissMenu);
      document.removeEventListener('keydown', dismissMenu);
    };
  }, [menuFor]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    const cleanName = name.trim();
    if (!cleanName) { setError('Vui lòng nhập tên danh mục.'); return; }
    if (cleanName.length > 80) { setError('Tên danh mục tối đa 80 ký tự.'); return; }
    setBusy(true);
    try {
      const category = await api('/api/admin/categories', { method: 'POST', body: { name: cleanName } });
      onCreated(category);
      setName('');
      setAdding(false);
      setNotice(`Đã thêm “${category.name}” ${createdMessage}`);
    } catch (requestError) {
      setError(requestError.fields?.name || requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function startEditing(category) {
    setAdding(false);
    setMenuFor('');
    setEditing(category.id);
    setEditName(category.name);
    setActionError('');
    setNotice('');
  }

  async function saveEdit(event, category) {
    event.preventDefault();
    const cleanName = editName.trim();
    setActionError('');
    if (!cleanName) { setActionError('Vui lòng nhập tên danh mục.'); return; }
    if (cleanName.length > 80) { setActionError('Tên danh mục tối đa 80 ký tự.'); return; }
    setActionBusy(true);
    try {
      const updated = await api(`/api/admin/categories/${category.id}`, { method: 'PATCH', body: { name: cleanName } });
      onUpdated(updated);
      setEditing(null);
      setNotice(`Đã cập nhật danh mục “${updated.name}”.`);
    } catch (requestError) {
      setActionError(requestError.fields?.name || requestError.message);
    } finally {
      setActionBusy(false);
    }
  }

  function closeDeleteDialog() {
    if (!actionBusy) { setDeleteTarget(null); setActionError(''); }
  }

  async function confirmCategoryDelete() {
    if (!deleteTarget || actionBusy) return;
    setActionBusy(true);
    setActionError('');
    try {
      await api(`/api/admin/categories/${deleteTarget.id}`, { method: 'DELETE' });
      onDeleted(deleteTarget.id);
      setNotice(`Đã xóa danh mục “${deleteTarget.name}”.`);
      setDeleteTarget(null);
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setActionBusy(false);
    }
  }

  function handleDeleteDialogKeyDown(event) {
    if (event.key === 'Escape') { event.preventDefault(); closeDeleteDialog(); return; }
    if (event.key !== 'Tab' || !deleteDialogRef.current) return;
    const buttons = [...deleteDialogRef.current.querySelectorAll('button:not(:disabled)')];
    if (!buttons.length) return;
    if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
  }

  return <aside className="admin-category-panel" aria-labelledby="admin-category-title">
    <header className="admin-category-panel__heading">
      <h2 id="admin-category-title">{title}</h2>
    </header>
    {allowAll && selectable && <button className={`admin-category-all${selectedId ? '' : ' is-selected'}`} type="button" aria-pressed={!selectedId} onClick={() => onSelect('')}><span className="admin-category-option__mark" aria-hidden="true">{selectedId ? '·' : '✓'}</span><span>Tất cả món</span></button>}
    <div className="admin-category-list" role="list" aria-label="Danh mục hiện có">
      {categories.length ? categories.map((category) => <div className="admin-category-list__item" role="listitem" key={category.id}>
        {editing === category.id ? <form className="admin-category-edit" onSubmit={(event) => saveEdit(event, category)}>
          <label className="visually-hidden" htmlFor={`edit-category-${category.id}`}>Tên danh mục</label>
          <input id={`edit-category-${category.id}`} value={editName} maxLength="80" required autoFocus onChange={(event) => setEditName(event.target.value)} />
          {actionError && <p className="admin-category-error" role="alert">{actionError}</p>}
          <div className="admin-category-create__actions"><button className="admin-primary-button" type="submit" disabled={actionBusy}>{actionBusy ? 'Đang lưu…' : 'Lưu'}</button><button className="admin-secondary-button" type="button" disabled={actionBusy} onClick={() => { setEditing(null); setActionError(''); }}>Hủy</button></div>
        </form> : <div className="admin-category-row">
          {selectable ? <button className={`admin-category-option${selectedId === category.id ? ' is-selected' : ''}`} type="button" aria-pressed={selectedId === category.id} onClick={() => onSelect(category.id)}>
            <span className="admin-category-option__mark" aria-hidden="true">{selectedId === category.id ? '✓' : '·'}</span>
            <span>{category.name}</span>
          </button> : <span className="admin-category-option admin-category-option--static"><span className="admin-category-option__mark" aria-hidden="true">·</span><span>{category.name}</span></span>}
          <div className="admin-category-actions">
            <button className="admin-category-menu-trigger" type="button" aria-label={`Tùy chọn danh mục ${category.name}`} aria-expanded={menuFor === category.id} onClick={() => { setMenuFor(menuFor === category.id ? '' : category.id); setActionError(''); }}>•••</button>
            {menuFor === category.id && <div className="admin-category-menu" role="group" aria-label={`Thao tác với ${category.name}`}>
              <button type="button" onClick={() => startEditing(category)}>Sửa</button>
              <button className="is-danger" type="button" onClick={() => { setMenuFor(''); setActionError(''); setDeleteTarget(category); }}>Xóa</button>
            </div>}
          </div>
        </div>}
      </div>) : <p className="admin-category-empty">Chưa có danh mục. Hãy thêm danh mục đầu tiên.</p>}
    </div>
    {notice && <p className="admin-category-notice" role="status">{notice}</p>}
    {adding ? <form className="admin-category-create" onSubmit={submit}>
      <label htmlFor="newCategoryName">Tên danh mục mới</label>
      <input id="newCategoryName" type="text" value={name} maxLength="80" required autoFocus onChange={(event) => setName(event.target.value)} placeholder="Ví dụ: Món khai vị" />
      {error && <p className="admin-category-error" role="alert">{error}</p>}
      <div className="admin-category-create__actions"><button className="admin-primary-button" type="submit" disabled={busy}>{busy ? 'Đang thêm…' : 'Thêm danh mục'}</button><button className="admin-secondary-button" type="button" disabled={busy} onClick={() => { setAdding(false); setError(''); }}>Hủy</button></div>
    </form> : <button className="admin-category-add" type="button" onClick={() => { setAdding(true); setEditing(null); setNotice(''); }}>+ Thêm danh mục</button>}
    {deleteTarget && createPortal(<div className="admin-delete-overlay" onClick={(event) => { if (event.target === event.currentTarget) closeDeleteDialog(); }}>
      <section className="admin-panel admin-delete-panel admin-category-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="category-delete-title" aria-describedby="category-delete-description" ref={deleteDialogRef} onKeyDown={handleDeleteDialogKeyDown}>
        <button className="admin-delete-close" type="button" aria-label="Đóng cửa sổ xác nhận" disabled={actionBusy} onClick={closeDeleteDialog}>×</button>
        <div className="admin-delete-warning"><span className="admin-delete-icon" aria-hidden="true">!</span><div><p className="eyebrow">XÁC NHẬN THAO TÁC</p><h2 id="category-delete-title">Xóa danh mục này?</h2><p id="category-delete-description">Danh mục “{deleteTarget.name}” sẽ bị xóa nếu không còn món ăn nào sử dụng.</p></div></div>
        {actionError && <div className="form-error-summary admin-delete-error" role="alert"><strong>Không thể xóa danh mục.</strong><p>{actionError}</p></div>}
        <div className="admin-delete-actions"><button className="admin-secondary-button" type="button" disabled={actionBusy} onClick={closeDeleteDialog}>Hủy</button><button className="admin-danger-button" type="button" disabled={actionBusy} onClick={confirmCategoryDelete}>{actionBusy ? 'Đang xóa…' : 'Xác nhận xóa'}</button></div>
      </section>
    </div>, document.body)}
  </aside>;
}

function AdminDeletePage({ resource }) {
  const config = RESOURCES[resource];
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const listingPath = `/admin/${resource}`;
  const requestedReturnTo = location.state?.from;
  const returnTo = typeof requestedReturnTo === 'string' && (requestedReturnTo === listingPath || requestedReturnTo.startsWith(`${listingPath}?`)) ? requestedReturnTo : listingPath;
  const successParams = new URLSearchParams(returnTo.split('?')[1] || '');
  successParams.delete('page');
  const successQuery = successParams.toString();
  const successReturnTo = `${listingPath}${successQuery ? `?${successQuery}` : ''}`;
  const state = useLoad(id ? `${pathFor(resource)}/${id}` : null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState(false);
  const requestLocked = React.useRef(false);
  const dialogRef = React.useRef(null);
  const closeRef = React.useRef(null);

  React.useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, []);

  function close() {
    if (!busy && !success) navigate(returnTo, { replace: true });
  }

  function handleDialogKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
    if (event.key !== 'Tab') return;
    const buttons = [...dialogRef.current.querySelectorAll('button:not(:disabled)')];
    if (!buttons.length) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  React.useEffect(() => {
    if (!success) return undefined;
    const timer = window.setTimeout(() => {
      navigate(successReturnTo, { replace: true, state: { notice: `Đã xóa ${config.label.toLowerCase()} “${state.data?.name || state.data?.referenceCode || ''}”.`, deletedId: id } });
    }, 850);
    return () => window.clearTimeout(timer);
  }, [config.label, navigate, state.data, success, successReturnTo]);

  async function confirmDelete() {
    if (requestLocked.current || !state.data) return;
    requestLocked.current = true;
    setBusy(true);
    setError('');
    try {
      await api(`${pathFor(resource)}/${id}`, { method: 'DELETE' });
      setSuccess(true);
    } catch (requestError) {
      requestLocked.current = false;
      setBusy(false);
      setError(requestError.message);
    }
  }

  const item = state.data;
  const details = item ? adminDeleteDetails(resource, item) : [];
  return createPortal(<div className="admin-delete-overlay" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="admin-panel admin-delete-panel" role="dialog" aria-modal="true" aria-labelledby="admin-delete-title" ref={dialogRef} onKeyDown={handleDialogKeyDown}>
      <button className="admin-delete-close" type="button" aria-label="Đóng cửa sổ xác nhận" disabled={busy || success} onClick={close} ref={closeRef}>×</button>
      {state.loading ? <><h2 id="admin-delete-title">Xóa {config.label.toLowerCase()}</h2><Loading label={`Đang tải thông tin ${config.label.toLowerCase()}…`} /></> : state.error ? <><h2 id="admin-delete-title">Không thể xác minh mục cần xóa</h2><ErrorState message={state.error} onRetry={state.reload} /></> : item ? <>
        <div className="admin-delete-warning"><span className="admin-delete-icon" aria-hidden="true">!</span><div><p className="eyebrow">THAO TÁC KHÔNG THỂ HOÀN TÁC</p><h2 id="admin-delete-title">Bạn có chắc muốn xóa mục này?</h2><p>{adminDeleteConsequence(resource)}</p></div></div>
        <div className="admin-delete-record"><h3>{item.name || item.referenceCode}</h3>{resource === 'dishes' && item.description && <p className="admin-delete-description">{item.description}</p>}<dl className="admin-delete-details">{details.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl></div>
        {error && <div className="form-error-summary admin-delete-error" role="alert"><strong>Không thể xóa mục này.</strong><p>{error}</p></div>}
        {success && <p className="admin-delete-success" role="status">Đã xóa thành công. Đang chuyển về danh sách…</p>}
      </> : <h2 id="admin-delete-title">Không tìm thấy mục cần xóa.</h2>}
      <div className="admin-delete-actions"><button className="admin-secondary-button" type="button" disabled={busy || success} onClick={close}>Hủy</button>{item && !state.error && <button className="admin-danger-button" type="button" disabled={busy || success} onClick={confirmDelete}>{busy ? 'Đang xóa…' : success ? 'Đã xóa' : 'Xác nhận xóa'}</button>}</div>
    </section>
  </div>, document.body);
}

function adminDeleteDetails(resource, item) {
  if (resource === 'dishes') return [
    { label: 'Danh mục', value: item.category?.name },
    { label: 'Giá bán', value: money(item.price) },
    { label: 'Đầu bếp', value: item.chef?.name || 'Chưa gán' },
    { label: 'Nguyên liệu', value: item.ingredients?.length ? item.ingredients.map(({ ingredient }) => ingredient?.name).filter(Boolean).join(', ') : 'Chưa có nguyên liệu' },
    { label: 'Trạng thái', value: item.isPublished ? 'Đã công khai' : 'Bản nháp' }
  ];
  if (resource === 'chefs') return [
    { label: 'Chức danh', value: item.title },
    { label: 'Sở trường', value: item.specialty },
    { label: 'Món phụ trách', value: item.dishes?.length ? item.dishes.map((dish) => dish.name).join(', ') : 'Chưa gán món' },
    { label: 'Hồ sơ', value: item.isPublished ? 'Công khai' : 'Bản nháp' }
  ];
  if (resource === 'ingredients') return [
    { label: 'Đang dùng trong món', value: item.dishes?.length ? item.dishes.map(({ dish }) => dish?.name).filter(Boolean).join(', ') : 'Chưa được sử dụng' }
  ];
  return [
    { label: 'Mã yêu cầu', value: item.referenceCode },
    { label: 'Khách', value: item.customerName },
    { label: 'Điện thoại', value: item.phone },
    { label: 'Email', value: item.email },
    { label: 'Thời gian', value: dateTime(item.startsAt) },
    { label: 'Số khách', value: item.guestCount },
    { label: 'Trạng thái', value: STATUS_LABEL[item.status] || item.status },
    ...(item.customerNote ? [{ label: 'Lời nhắn', value: item.customerNote }] : [])
  ];
}

function adminDeleteConsequence(resource) {
  if (resource === 'dishes') return 'Món ăn sẽ bị xóa khỏi hệ thống và website; các liên kết nguyên liệu của món cũng sẽ được gỡ.';
  if (resource === 'chefs') return 'Hồ sơ đầu bếp sẽ bị xóa. Các món đang gán vẫn được giữ lại nhưng sẽ không còn đầu bếp phụ trách.';
  if (resource === 'ingredients') return 'Nguyên liệu sẽ bị xóa khỏi danh sách. Nếu nguyên liệu vẫn được dùng trong món, máy chủ sẽ từ chối thao tác.';
  return 'Yêu cầu đặt bàn cùng thông tin liên hệ và ghi chú sẽ bị xóa khỏi hệ thống.';
}

function AdminField({ id, label, wide = false, required = false, error, children }) {
  function describeControl(node) {
    return React.Children.map(node, (child) => {
      if (!React.isValidElement(child)) return child;
      const isControl = typeof child.type === 'string' && ['input', 'select', 'textarea'].includes(child.type);
      const childProps = child.props.children ? { children: describeControl(child.props.children) } : {};
      if (isControl) {
        childProps['aria-invalid'] = Boolean(error);
        childProps['aria-describedby'] = error ? `${id}-error` : child.props['aria-describedby'];
      }
      return React.cloneElement(child, childProps);
    });
  }
  return <div className={`form-field${wide ? ' form-field-wide' : ''}`}><label htmlFor={id}>{label}{required && <> <span aria-hidden="true">*</span></>}</label>{describeControl(children)}{error && <small id={`${id}-error`} className="field-error">{error}</small>}</div>;
}
function clearFieldError(errors, field) { const next = { ...errors }; delete next[field]; return next; }
function CheckField({ label, description, value, onChange }) { return <label className="check-row"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} /><span><strong>{label}</strong>{description && <small>{description}</small>}</span></label>; }

function IngredientPicker({ ingredients, selected, error, onToggle }) {
  const [query, setQuery] = React.useState('');
  const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLocaleLowerCase('vi');
  const filtered = ingredients.filter((item) => normalize(item.name).includes(normalize(query.trim())));
  const selectedItems = ingredients.filter((item) => selected.includes(item.id));
  return <div className="form-field form-field-wide ingredient-picker">
    <div className="ingredient-picker__selected" role="group" aria-label="Nguyên liệu đang có trong món"><div className="ingredient-picker__selected-heading"><strong>Đang có trong món</strong><span>{selectedItems.length} nguyên liệu</span></div><div className="ingredient-picker__chips" aria-live="polite">{selectedItems.length ? selectedItems.map((item) => <span className="ingredient-picker__chip" key={item.id}>{item.name}<button className="ingredient-picker__remove" type="button" aria-label={`Bỏ ${item.name} khỏi món`} onClick={() => onToggle(item.id)}>×</button></span>) : <span className="ingredient-picker__empty">Chưa chọn nguyên liệu nào.</span>}</div></div>
    <label htmlFor="ingredientSearch">Thêm nguyên liệu</label><input id="ingredientSearch" type="search" autoComplete="off" placeholder="Tìm nguyên liệu theo tên…" value={query} onChange={(event) => setQuery(event.target.value)} aria-describedby="ingredients-help" aria-controls="ingredient-options" /><small id="ingredients-help" className="field-help">Tìm rồi đánh dấu các nguyên liệu muốn gắn với món. Danh sách được sắp xếp theo tên.</small>
    <fieldset id="ingredientIds" className="ingredient-picker__list" aria-invalid={Boolean(error)} aria-describedby={error ? 'ingredientIds-error ingredients-help' : 'ingredients-help'}><legend className="visually-hidden">Chọn nguyên liệu cho món</legend><div id="ingredient-options" className="ingredient-picker__options">{filtered.map((item) => <label className="ingredient-picker__option" key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={() => onToggle(item.id)} /><span>{item.name}</span></label>)}</div>{query && !filtered.length && <p className="ingredient-picker__no-results">Không tìm thấy nguyên liệu phù hợp.</p>}</fieldset>{error && <small id="ingredientIds-error" className="field-error">{error}</small>}
  </div>;
}

function DishAssignmentPicker({ dishes, selected, error, onToggle }) {
  const [query, setQuery] = React.useState('');
  const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLocaleLowerCase('vi');
  const filtered = dishes.filter((dish) => normalize(dish.name).includes(normalize(query.trim())));
  const selectedDishes = dishes.filter((dish) => selected.includes(dish.id));
  return <div className="form-field form-field-wide ingredient-picker dish-assignment-picker">
    <div className="ingredient-picker__selected" role="group" aria-label="Các món do đầu bếp phụ trách"><div className="ingredient-picker__selected-heading"><strong>Món đầu bếp phụ trách</strong><span>{selectedDishes.length} món</span></div><div className="ingredient-picker__chips" aria-live="polite">{selectedDishes.length ? selectedDishes.map((dish) => <span className="ingredient-picker__chip" key={dish.id}>{dish.name}<button className="ingredient-picker__remove" type="button" aria-label={`Bỏ ${dish.name} khỏi danh sách món phụ trách`} onClick={() => onToggle(dish.id)}>×</button></span>) : <span className="ingredient-picker__empty">Chưa gán món nào cho đầu bếp này.</span>}</div></div>
    <label htmlFor="dishAssignmentSearch">Thêm món phụ trách</label><input id="dishAssignmentSearch" type="search" autoComplete="off" placeholder="Tìm món theo tên…" value={query} onChange={(event) => setQuery(event.target.value)} aria-describedby="dish-assignment-help" aria-controls="dish-assignment-options" /><small id="dish-assignment-help" className="field-help">Đánh dấu các món do đầu bếp phụ trách. Món đang gán cho đầu bếp khác sẽ được chuyển khi lưu.</small>
    <fieldset className="ingredient-picker__list" aria-invalid={Boolean(error)} aria-describedby={error ? 'dishIds-error dish-assignment-help' : 'dish-assignment-help'}><legend className="visually-hidden">Chọn món do đầu bếp phụ trách</legend><div id="dish-assignment-options" className="ingredient-picker__options">{filtered.map((dish) => <label className="ingredient-picker__option" key={dish.id}><input type="checkbox" checked={selected.includes(dish.id)} onChange={() => onToggle(dish.id)} /><span>{dish.name}</span></label>)}</div>{!dishes.length ? <p className="ingredient-picker__no-results">Chưa có món ăn để gán.</p> : query && !filtered.length ? <p className="ingredient-picker__no-results">Không tìm thấy món phù hợp.</p> : null}</fieldset>{error && <small id="dishIds-error" className="field-error">{error}</small>}
  </div>;
}

function MissingPage() { return <section className="error-page section-pad"><div className="wrap error-card"><p className="eyebrow">BẾP HỘI</p><h1>Trang không<br /><em>khả dụng.</em></h1><p>Địa chỉ này có thể đã thay đổi. Bạn có thể quay lại trang chủ để tiếp tục khám phá.</p><Link className="button button-dark" to="/">Về trang chủ <span aria-hidden="true">↗</span></Link></div></section>; }

export default function App() {
  const location = useLocation();
  const backgroundLocation = location.state?.backgroundLocation;
  return <><Routes location={backgroundLocation || location}>
    <Route element={<PublicShell />}>
      <Route index element={<HomePage />} /><Route path="menu" element={<MenuPage />} /><Route path="dishes/:id" element={<DishPage />} /><Route path="chefs" element={<ChefsPage />} /><Route path="reservations/new" element={<ReservationPage />} />
    </Route>
    <Route path="/admin" element={<AdminShell />}>
      <Route index element={<AdminDashboard />} />
      {Object.keys(RESOURCES).map((resource) => <React.Fragment key={resource}>
        <Route path={resource} element={<AdminList resource={resource} />} />
        {resource !== 'reservations' && <Route path={`${resource}/new`} element={<AdminForm resource={resource} />} />}
        <Route path={`${resource}/:id/edit`} element={<AdminForm resource={resource} />} />
        <Route path={`${resource}/:id/delete`} element={<AdminDeletePage resource={resource} />} />
      </React.Fragment>)}
    </Route>
    <Route path="*" element={<MissingPage />} />
  </Routes>
    {backgroundLocation && <Routes><Route path="/admin/:resource/:id/delete" element={<AdminDeleteRoute />} /></Routes>}
  </>;
}

function AdminDeleteRoute() {
  const { resource } = useParams();
  return RESOURCES[resource] ? <AdminDeletePage resource={resource} /> : null;
}

