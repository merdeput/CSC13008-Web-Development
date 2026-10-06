(() => {
  const row = document.querySelector('[data-created-student]');
  if (!row) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  row.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'center' });
  row.focus({ preventScroll: true });
  row.classList.add('student-created');
  window.setTimeout(() => row.classList.remove('student-created'), 3500);

  // Refresh should load the list without repeating the creation notice or flash.
  const url = new URL(window.location.href);
  url.searchParams.delete('created');
  url.hash = '';
  window.history.replaceState(null, '', url.pathname + url.search);
})();
