document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('northstar-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const setTheme = (dark) => {
    document.body.classList.toggle('dark-mode', dark);
    document.querySelectorAll('.theme-toggle').forEach((button) => {
      button.setAttribute('aria-pressed', String(dark));
      button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      button.textContent = dark ? '☀' : '☾';
    });
  };
  setTheme(savedTheme ? savedTheme === 'dark' : prefersDark);

  document.querySelectorAll('.site-header').forEach((header) => {
    const themeToggle = document.createElement('button');
    themeToggle.className = 'theme-toggle';
    themeToggle.type = 'button';
    header.append(themeToggle);
    themeToggle.addEventListener('click', () => {
      const dark = !document.body.classList.contains('dark-mode');
      localStorage.setItem('northstar-theme', dark ? 'dark' : 'light');
      setTheme(dark);
    });
    setTheme(document.body.classList.contains('dark-mode'));
  });

  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }));
  }

  document.querySelectorAll('a[href^="#"]').forEach((link) => link.addEventListener('click', (event) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (target) { event.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }));

  document.querySelectorAll('.member-card').forEach((card) => {
    const button = card.querySelector('.details-toggle');
    const closeOthers = () => document.querySelectorAll('.member-card.is-open').forEach((other) => {
      if (other !== card) { other.classList.remove('is-open'); other.querySelector('.details-toggle')?.setAttribute('aria-expanded', 'false'); }
    });
    const setOpen = (open) => { card.classList.toggle('is-open', open); button?.setAttribute('aria-expanded', String(open)); };
    button?.addEventListener('click', () => { const next = !card.classList.contains('is-open'); if (next) closeOthers(); setOpen(next); });
  });
});
