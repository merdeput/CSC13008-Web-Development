(() => {
  const root = document.documentElement;
  root.classList.remove('no-js');
  root.classList.add('js');

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const menuResults = document.querySelector('[data-menu-results]');
  if (menuResults) {
    let loadLink = document.querySelector('[data-menu-more]');
    const errorNotice = document.querySelector('[data-menu-error]');
    let loadingMenuPage = false;
    const loadMenuPage = async (event) => {
      if (event) event.preventDefault();
      if (!loadLink || loadingMenuPage) return;
      loadingMenuPage = true;
      loadLink.setAttribute('aria-disabled', 'true');
      const originalLabel = loadLink.textContent;
      loadLink.textContent = 'Đang tải…';
      if (errorNotice) errorNotice.hidden = true;
      try {
        const requestUrl = new URL(loadLink.href, window.location.href);
        requestUrl.searchParams.set('fragment', '1');
        const response = await fetch(requestUrl, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        if (!response.ok) throw new Error('Chưa thể tải thêm món. Vui lòng thử lại.');
        const documentFragment = new DOMParser().parseFromString(await response.text(), 'text/html');
        const pageFragment = documentFragment.querySelector('[data-menu-fragment]');
        const destinationGrid = menuResults.querySelector('.dish-card-grid');
        const incomingGrid = pageFragment && pageFragment.querySelector('.dish-card-grid');
        if (!pageFragment || !destinationGrid || !incomingGrid) throw new Error('Phản hồi thực đơn không hợp lệ.');
        const newCards = [...incomingGrid.children];
        destinationGrid.append(...newCards);
        newCards.forEach((card) => card.querySelectorAll('img').forEach((image) => {
          image.addEventListener('error', () => { image.src = '/images/food-fallback.svg'; }, { once: true });
        }));
        menuResults.dataset.page = pageFragment.dataset.menuPage;
        menuResults.dataset.pageCount = pageFragment.dataset.menuPageCount;
        const currentPage = Number(pageFragment.dataset.menuPage);
        const pageCount = Number(pageFragment.dataset.menuPageCount);
        if (currentPage >= pageCount) {
          const complete = document.createElement('p');
          complete.className = 'menu-load-more';
          complete.dataset.menuComplete = '';
          complete.textContent = 'Đã hiển thị toàn bộ ' + pageFragment.dataset.menuTotal + ' món.';
          loadLink.replaceWith(complete);
          loadLink = null;
        } else {
          const nextUrl = new URL(loadLink.href, window.location.href);
          nextUrl.searchParams.set('page', String(currentPage + 1));
          loadLink.href = nextUrl.href;
          loadLink.textContent = menuResults.dataset.menuView === 'infinite' ? 'Cuộn xuống để xem thêm món' : 'Tải thêm món ↓';
          loadLink.removeAttribute('aria-disabled');
          if (infiniteObserver) {
            infiniteObserver.unobserve(loadLink);
            infiniteObserver.observe(loadLink);
          }
        }
      } catch (error) {
        if (errorNotice) {
          errorNotice.textContent = error.message || 'Chưa thể tải thêm món. Vui lòng thử lại.';
          errorNotice.hidden = false;
        }
        if (loadLink) {
          loadLink.textContent = originalLabel;
          loadLink.removeAttribute('aria-disabled');
        }
      } finally {
        loadingMenuPage = false;
      }
    };
    let infiniteObserver = null;
    if (loadLink) {
      loadLink.addEventListener('click', loadMenuPage);
      if (menuResults.dataset.menuView === 'infinite' && 'IntersectionObserver' in window) {
        infiniteObserver = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) loadMenuPage();
        }, { rootMargin: '240px 0px' });
        infiniteObserver.observe(loadLink);
      }
    }
  }
  const toggle = document.querySelector('.mobile-nav-toggle');
  const navigation = document.getElementById('primary-navigation');
  const pageTransition = document.querySelector('.page-transition');
  let pageTransitionTimer = 0;

  if (pageTransition) {
    const clearPageTransition = () => {
      if (pageTransitionTimer) window.clearTimeout(pageTransitionTimer);
      pageTransitionTimer = 0;
      pageTransition.classList.remove('is-active');
    };
    window.addEventListener('pageshow', clearPageTransition);
    window.addEventListener('popstate', clearPageTransition);
  }

  if (pageTransition && !reducedMotion.matches) {
    document.addEventListener('click', (event) => {
      if (reducedMotion.matches) return;
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!link || link.hasAttribute('download') || link.hasAttribute('data-menu-more') || (link.target && link.target !== '_self')) return;

      let destination;
      try {
        destination = new URL(link.href, window.location.href);
      } catch {
        return;
      }
      if (destination.origin !== window.location.origin || destination.href === window.location.href) return;
      if (destination.pathname === window.location.pathname && destination.search === window.location.search && destination.hash) return;

      event.preventDefault();
      pageTransition.classList.add('is-active');
      pageTransitionTimer = window.setTimeout(() => {
        pageTransitionTimer = 0;
        window.location.assign(destination.href);
      }, 240);
    });
  }

  const homeHeading = document.querySelector('.home-brandline');
  if (homeHeading) {
    const textNodes = [];
    const walker = document.createTreeWalker(homeHeading, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    const segmenter = typeof Intl.Segmenter === 'function'
      ? new Intl.Segmenter('vi', { granularity: 'grapheme' })
      : null;

    textNodes.forEach((node) => {
      const pieces = segmenter
        ? Array.from(segmenter.segment(node.nodeValue), (part) => part.segment)
        : Array.from(node.nodeValue);
      const fragment = document.createDocumentFragment();
      pieces.forEach((piece) => {
        if (/^\s+$/u.test(piece)) {
          fragment.append(document.createTextNode(piece));
          return;
        }
        const letter = document.createElement('span');
        letter.className = 'hover-letter';
        letter.setAttribute('aria-hidden', 'true');
        letter.textContent = piece;
        fragment.append(letter);
      });
      node.replaceWith(fragment);
    });
  }

  const closeNavigation = (returnFocus = false) => {
    if (!toggle || !navigation) return;
    toggle.setAttribute('aria-expanded', 'false');
    navigation.classList.remove('is-open');
    if (returnFocus) toggle.focus();
  };

  if (toggle && navigation) {
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      navigation.classList.toggle('is-open', !expanded);
    });
    navigation.addEventListener('click', (event) => {
      if (event.target.closest('a')) {
        closeNavigation();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        closeNavigation(true);
      }
    });

    document.addEventListener('click', (event) => {
      if (!navigation.contains(event.target) && !toggle.contains(event.target)) closeNavigation();
    });

    window.matchMedia('(min-width: 761px)').addEventListener('change', () => closeNavigation());
  }

  document.querySelectorAll('img').forEach((image) => {
    const applyFallback = () => {
      if (image.dataset.fallbackApplied) return;
      image.dataset.fallbackApplied = 'true';
      image.src = image.dataset.fallback || '/images/food-fallback.svg';
    };
    image.addEventListener('error', applyFallback);
    if (image.complete && image.naturalWidth === 0) applyFallback();
  });

  document.querySelectorAll('.field-error[id]').forEach((error) => {
    const fieldId = error.id.replace(/-error$/, '');
    const field = document.getElementById(fieldId);
    if (!field) return;
    const describedBy = new Set((field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    describedBy.add(error.id);
    field.setAttribute('aria-describedby', [...describedBy].join(' '));
  });

  document.querySelectorAll('[data-ingredient-picker]').forEach((picker) => {
    const search = picker.querySelector('[data-ingredient-search]');
    const options = [...picker.querySelectorAll('[data-ingredient-option]')];
    const chips = picker.querySelector('[data-selected-ingredients]');
    const count = picker.querySelector('[data-selected-count]');
    const empty = picker.querySelector('[data-selected-empty]');
    const noResults = picker.querySelector('[data-ingredient-no-results]');
    if (!search || !chips || !count) return;

    const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('vi').replace(/đ/g, 'd');
    const updateSelection = () => {
      const selected = options.filter((option) => option.querySelector('input').checked);
      chips.replaceChildren();
      selected.forEach((option) => {
        const checkbox = option.querySelector('input');
        const name = option.querySelector('span').textContent.trim();
        const chip = document.createElement('span');
        chip.className = 'ingredient-picker__chip';
        chip.append(document.createTextNode(name));
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'ingredient-picker__remove';
        remove.setAttribute('aria-label', `Bỏ ${name} khỏi món`);
        remove.textContent = '×';
        remove.addEventListener('click', () => {
          checkbox.checked = false;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
          search.focus();
        });
        chip.append(remove);
        chips.append(chip);
      });
      if (!selected.length) {
        const message = document.createElement('span');
        message.className = 'ingredient-picker__empty';
        message.textContent = 'Chưa chọn nguyên liệu nào.';
        chips.append(message);
      }
      count.textContent = `${selected.length} nguyên liệu`;
      if (empty) empty.hidden = true;
    };

    const filterOptions = () => {
      const query = normalize(search.value.trim());
      let visibleCount = 0;
      options.forEach((option) => {
        const matches = normalize(option.dataset.name || '').includes(query);
        option.hidden = !matches;
        if (matches) visibleCount += 1;
      });
      if (noResults) noResults.hidden = visibleCount > 0;
    };

    options.forEach((option) => option.querySelector('input').addEventListener('change', updateSelection));
    search.addEventListener('input', filterOptions);
    updateSelection();
  });

  document.querySelectorAll('[data-dish-assignment-picker]').forEach((picker) => {
    const search = picker.querySelector('[data-dish-assignment-search]');
    const options = [...picker.querySelectorAll('[data-dish-assignment-option]')];
    const noResults = picker.querySelector('[data-dish-assignment-empty]');
    if (!search) return;
    const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('vi').replace(/đ/g, 'd');
    search.addEventListener('input', () => {
      const query = normalize(search.value.trim());
      let visibleCount = 0;
      options.forEach((option) => {
        const matches = normalize(option.dataset.name || '').includes(query);
        option.hidden = !matches;
        if (matches) visibleCount += 1;
      });
      if (noResults) noResults.hidden = visibleCount > 0;
    });

    const chips = picker.querySelector('[data-assignment-chips]');
    const count = picker.querySelector('[data-assignment-count]');
    const updateAssignments = () => {
      if (!chips) return;
      const selected = options.filter((option) => option.querySelector('input').checked);
      chips.replaceChildren();
      selected.forEach((option) => {
        const checkbox = option.querySelector('input');
        const name = option.querySelector('span').childNodes[0].textContent.trim();
        const chip = document.createElement('span');
        chip.className = 'ingredient-picker__chip';
        chip.append(document.createTextNode(name));
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'ingredient-picker__remove';
        remove.setAttribute('aria-label', `Bỏ ${name} khỏi danh sách phụ trách`);
        remove.textContent = '×';
        remove.addEventListener('click', () => {
          checkbox.checked = false;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
          search.focus();
        });
        chip.append(remove);
        chips.append(chip);
      });
      if (!selected.length) {
        const empty = document.createElement('span');
        empty.className = 'ingredient-picker__empty';
        empty.textContent = 'Chưa gán món nào.';
        chips.append(empty);
      }
      if (count) count.textContent = `${selected.length} món`;
    };
    options.forEach((option) => option.querySelector('input').addEventListener('change', updateAssignments));
    updateAssignments();
  });

  document.querySelectorAll('[data-chef-picker]').forEach((picker) => {
    const search = picker.querySelector('[data-chef-search]');
    const options = [...picker.querySelectorAll('[data-chef-option]')];
    const selected = picker.querySelector('[data-selected-chef]');
    const empty = picker.querySelector('[data-chef-empty]');
    const noResults = picker.querySelector('[data-chef-no-results]');
    if (!search || !selected) return;
    const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('vi').replace(/đ/g, 'd');
    const updateChef = () => {
      const chosen = options.find((option) => option.querySelector('input').checked);
      selected.replaceChildren();
      if (!chosen || !chosen.querySelector('input').value) {
        const message = document.createElement('span');
        message.className = 'ingredient-picker__empty';
        message.textContent = 'Chưa gán đầu bếp phụ trách.';
        selected.append(message);
        if (empty) empty.hidden = true;
        return;
      }
      const label = chosen.querySelector('span').textContent.trim();
      const chip = document.createElement('span');
      chip.className = 'ingredient-picker__chip';
      chip.append(document.createTextNode(label));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'ingredient-picker__remove';
      remove.setAttribute('aria-label', `Bỏ ${label} khỏi món`);
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        const unassigned = options.find((option) => option.querySelector('input').value === '');
        if (unassigned) {
          const radio = unassigned.querySelector('input');
          radio.checked = true;
          radio.dispatchEvent(new Event('change', { bubbles: true }));
        }
        search.focus();
      });
      chip.append(remove);
      selected.append(chip);
      if (empty) empty.hidden = true;
    };
    search.addEventListener('input', () => {
      const query = normalize(search.value.trim());
      let visibleCount = 0;
      options.forEach((option) => {
        const matches = normalize(option.dataset.name || '').includes(query);
        option.hidden = !matches;
        if (matches) visibleCount += 1;
      });
      if (noResults) noResults.hidden = visibleCount > 0;
    });
    options.forEach((option) => option.querySelector('input').addEventListener('change', updateChef));
    updateChef();
  });

  document.querySelectorAll('[data-menu-settings-root]').forEach((settings) => {
    const toggle = settings.querySelector('[data-menu-settings-toggle]');
    const panel = settings.querySelector('[data-menu-settings]');
    if (!toggle || !panel) return;
    const close = (restoreFocus = false) => {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      if (restoreFocus) toggle.focus();
    };
    toggle.addEventListener('click', () => {
      const open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      if (open) panel.querySelector('a, button')?.focus();
    });
    document.addEventListener('click', (event) => {
      if (!settings.contains(event.target)) close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !panel.hidden) close(true);
    });
  });

  document.querySelectorAll('[data-admin-auto-submit]').forEach((control) => {
    control.addEventListener('change', () => control.form?.requestSubmit());
  });

  document.querySelectorAll('[data-menu-search-mode]').forEach((control) => {
    control.addEventListener('change', () => control.form?.requestSubmit());
  });

  document.querySelectorAll('[data-admin-filter-overlay]').forEach((overlay) => {
    const dialog = overlay.querySelector('[data-admin-filter-dialog]');
    const trigger = document.querySelector('[data-admin-filter-open]');
    const form = overlay.querySelector('[data-admin-filter-form]');
    if (!dialog || !trigger || !form) return;
    const closeButtons = [...overlay.querySelectorAll('[data-admin-filter-close]')];
    let previousOverflow = '';
    const close = (restoreFocus = true) => {
      overlay.hidden = true;
      document.body.style.overflow = previousOverflow;
      trigger.setAttribute('aria-expanded', 'false');
      if (restoreFocus) trigger.focus();
    };
    const open = () => {
      previousOverflow = document.body.style.overflow;
      overlay.hidden = false;
      document.body.style.overflow = 'hidden';
      trigger.setAttribute('aria-expanded', 'true');
      dialog.focus();
    };
    trigger.addEventListener('click', open);
    closeButtons.forEach((button) => button.addEventListener('click', () => close()));
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]')].filter((item) => !item.hidden);
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) {
        event.preventDefault();
        focusable.at(-1).focus();
      } else if (!event.shiftKey && document.activeElement === focusable.at(-1)) {
        event.preventDefault();
        focusable[0].focus();
      }
    });
    const minInput = form.querySelector('[data-price-input="min"]');
    const maxInput = form.querySelector('[data-price-input="max"]');
    const minSlider = form.querySelector('[data-price-slider="min"]');
    const maxSlider = form.querySelector('[data-price-slider="max"]');
    const priceGroup = form.querySelector('.admin-dish-price-slider');
    const priceError = form.querySelector('[data-price-error]');
    const apply = overlay.querySelector('[data-admin-filter-submit]');
    const sliderLimit = Number(maxSlider?.max || 0);
    const updatePrices = (source) => {
      if (!minInput || !maxInput || !minSlider || !maxSlider) return;
      if (source === minSlider) {
        if (Number(minSlider.value) > Number(maxSlider.value)) maxSlider.value = minSlider.value;
        minInput.value = minSlider.value;
        maxInput.value = maxSlider.value === String(sliderLimit) ? '' : maxSlider.value;
      } else if (source === maxSlider) {
        if (Number(maxSlider.value) < Number(minSlider.value)) minSlider.value = maxSlider.value;
        minInput.value = minSlider.value === '0' ? '' : minSlider.value;
        maxInput.value = maxSlider.value === String(sliderLimit) ? '' : maxSlider.value;
      } else {
        if (minInput.value !== '') minSlider.value = String(Math.min(sliderLimit, Number(minInput.value)));
        else minSlider.value = '0';
        if (maxInput.value !== '') maxSlider.value = String(Math.min(sliderLimit, Number(maxInput.value)));
        else maxSlider.value = String(sliderLimit);
      }
      const min = minInput.value === '' ? null : Number(minInput.value);
      const max = maxInput.value === '' ? null : Number(maxInput.value);
      const invalid = min !== null && max !== null && min > max;
      if (priceError) priceError.hidden = !invalid;
      if (apply) apply.disabled = invalid;
      minInput.setAttribute('aria-invalid', String(invalid));
      maxInput.setAttribute('aria-invalid', String(invalid));
      if (priceGroup) {
        const low = Math.max(0, Math.min(sliderLimit, Number(minSlider.value)));
        const high = Math.max(low, Math.min(sliderLimit, Number(maxSlider.value)));
        priceGroup.style.setProperty('--price-range-start', `${sliderLimit ? low / sliderLimit * 100 : 0}%`);
        priceGroup.style.setProperty('--price-range-end', `${sliderLimit ? high / sliderLimit * 100 : 100}%`);
      }
    };
    [minInput, maxInput, minSlider, maxSlider].filter(Boolean).forEach((input) => input.addEventListener('input', () => updatePrices(input)));
    overlay.querySelector('[data-admin-filter-reset]')?.addEventListener('click', () => {
      form.querySelectorAll('input[type="checkbox"]').forEach((input) => { input.checked = false; });
      form.querySelectorAll('select').forEach((select) => { select.value = ''; });
      if (minInput) minInput.value = '';
      if (maxInput) maxInput.value = '';
      if (minSlider) minSlider.value = '0';
      if (maxSlider) maxSlider.value = String(sliderLimit);
      updatePrices(null);
    });
    form.addEventListener('submit', (event) => {
      updatePrices(null);
      if (apply?.disabled) event.preventDefault();
    });
  });

  let activeDeleteOpener = null;
  let activeDeleteOverlay = null;
  const closeDeleteOverlay = () => {
    if (!activeDeleteOverlay) return;
    document.body.style.overflow = activeDeleteOverlay.dataset.previousOverflow || '';
    activeDeleteOverlay.remove();
    activeDeleteOverlay = null;
    activeDeleteOpener?.focus();
  };
  document.addEventListener('click', async (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[data-admin-delete], a.admin-row-delete') : null;
    if (!link || !/^\/admin\/(?:dishes|chefs|ingredients|reservations|categories)\/[^/]+\/delete(?:\?|$)/.test(new URL(link.href, location.href).pathname + new URL(link.href, location.href).search)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    activeDeleteOpener = link;
    const current = new URL(location.href);
    current.searchParams.delete('page');
    const requestUrl = new URL(link.href, location.href);
    requestUrl.searchParams.set('returnTo', current.pathname + current.search);
    try {
      const response = await fetch(requestUrl, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      if (!response.ok) throw new Error('Unable to load delete confirmation.');
      const page = new DOMParser().parseFromString(await response.text(), 'text/html');
      const confirmation = page.querySelector('.confirm-panel');
      if (!confirmation) throw new Error('Delete confirmation was not found.');
      const overlay = document.createElement('div');
      overlay.className = 'admin-delete-overlay';
      overlay.dataset.previousOverflow = document.body.style.overflow;
      overlay.innerHTML = '<section class="admin-panel admin-delete-panel" role="alertdialog" aria-modal="true" aria-label="Xác nhận xóa" tabindex="-1"><button class="admin-delete-close" type="button" aria-label="Đóng xác nhận">×</button></section>';
      const panel = overlay.querySelector('.admin-delete-panel');
      panel.append(confirmation.cloneNode(true));
      const form = panel.querySelector('form');
      if (form && !form.querySelector('[name="returnTo"]')) {
        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.name = 'returnTo';
        hidden.value = current.pathname + current.search;
        form.append(hidden);
      }
      overlay.addEventListener('click', (clickEvent) => { if (clickEvent.target === overlay) closeDeleteOverlay(); });
      panel.addEventListener('keydown', (keyEvent) => {
        if (keyEvent.key === 'Escape') {
          keyEvent.preventDefault();
          closeDeleteOverlay();
        }
        if (keyEvent.key !== 'Tab') return;
        const focusable = [...panel.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled)')];
        if (!focusable.length) return;
        if (keyEvent.shiftKey && document.activeElement === focusable[0]) {
          keyEvent.preventDefault();
          focusable.at(-1).focus();
        } else if (!keyEvent.shiftKey && document.activeElement === focusable.at(-1)) {
          keyEvent.preventDefault();
          focusable[0].focus();
        }
      });
      overlay.querySelector('.admin-delete-close').addEventListener('click', closeDeleteOverlay);
      document.body.append(overlay);
      document.body.style.overflow = 'hidden';
      activeDeleteOverlay = overlay;
      overlay.querySelector('.admin-delete-close').focus();
    } catch {
      location.assign(requestUrl.href);
    }
  }, true);

  document.querySelectorAll('.site-form').forEach((form) => {
    form.addEventListener('submit', (event) => {
      if (!form.checkValidity()) {
        event.preventDefault();
        form.reportValidity();
        return;
      }

      form.classList.add('is-submitting');
      form.setAttribute('aria-busy', 'true');
      if (pageTransition && !reducedMotion.matches) pageTransition.classList.add('is-active');
      const submitButton = form.querySelector('[type="submit"]');
      if (submitButton) submitButton.disabled = true;
    });
  });

  let lastScrollY = window.scrollY;
  let scrollDirection = 'down';
  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    if (Math.abs(currentScrollY - lastScrollY) > 2) {
      scrollDirection = currentScrollY > lastScrollY ? 'down' : 'up';
      lastScrollY = currentScrollY;
    }
  }, { passive: true });

  if (!reducedMotion.matches && 'IntersectionObserver' in window) {
    const revealTargets = document.querySelectorAll('.reveal, .page-hero-inner, .cta-ornament');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const target = entry.target;
        const shouldShow = entry.isIntersecting && entry.intersectionRatio >= 0.06;

        if (!shouldShow) {
          target.classList.remove('is-visible');
          return;
        }

        if (target.classList.contains('is-visible')) return;
        const isDirectionalReveal = target.matches('.reveal-copy, .reveal-paper');
        if (isDirectionalReveal) {
          const entrySide = target.dataset.revealFrom === 'right' ? 'right' : 'left';
          const side = scrollDirection === 'up'
            ? (entrySide === 'left' ? 'right' : 'left')
            : entrySide;
          target.classList.remove('reveal-enter-from-top', 'reveal-enter-from-bottom');
          target.classList.toggle('reveal-enter-from-left', side === 'left');
          target.classList.toggle('reveal-enter-from-right', side === 'right');
          target.style.setProperty('--reveal-x', side === 'left' ? '-42px' : '42px');
          target.style.setProperty('--reveal-offset', '0px');
          if (target.classList.contains('reveal-card')) {
            target.style.setProperty('--card-hidden-y', '0px');
          }
          target.getBoundingClientRect();
        } else {
          const enteringFromTop = scrollDirection === 'up';
          target.classList.remove('reveal-enter-from-left', 'reveal-enter-from-right');
          target.classList.toggle('reveal-enter-from-top', enteringFromTop);
          target.classList.toggle('reveal-enter-from-bottom', !enteringFromTop);
          target.style.setProperty('--reveal-x', '0px');
          target.style.setProperty('--reveal-offset', enteringFromTop ? '-42px' : '42px');
          if (target.classList.contains('reveal-card')) {
            target.style.setProperty('--card-hidden-y', enteringFromTop ? '-48px' : '48px');
          }
        }
        target.classList.add('is-visible');
      });
    }, { threshold: [0, 0.06], rootMargin: '12% 0px 12% 0px' });

    let revealIndex = 0;
    let cardIndex = 0;
    let directionalIndex = 0;
    revealTargets.forEach((element) => {
      const isCard = element.matches('.dish-card, .chef-mini, .chef-profile');
      const isIllustration = element.matches('.story-art, .hero-photo, .cta-ornament');
      element.style.setProperty('--reveal-delay', `${(revealIndex++ % 5) * 55}ms`);
      if (element.matches('.reveal-copy, .reveal-paper') && !element.dataset.revealFrom) {
        element.dataset.revealFrom = directionalIndex % 2 === 0 ? 'left' : 'right';
      }
      if (element.matches('.reveal-copy, .reveal-paper')) directionalIndex += 1;

      if (isCard) {
        element.classList.add('reveal-card');
        element.style.setProperty('--card-tilt', cardIndex % 2 ? '2.8deg' : '-2.8deg');
        element.style.setProperty('--card-wobble', cardIndex % 2 ? '-.8deg' : '.8deg');
        element.style.setProperty('--reveal-delay', `${(cardIndex++ % 6) * 65}ms`);
      }
      if (isIllustration) element.classList.add('reveal-illustration');

      element.classList.add('reveal-pending');
      observer.observe(element);
    });
  }

  if (!reducedMotion.matches && 'IntersectionObserver' in window) {
    const lanternSections = document.querySelectorAll('[data-lantern-section]');
    if (lanternSections.length) {
      const lanternObserver = new IntersectionObserver((entries) => {
        entries.forEach(({ target, isIntersecting }) => {
          target.classList.toggle('lantern-awake', isIntersecting);
        });
      }, { threshold: 0, rootMargin: '-5% 0px -5% 0px' });
      lanternSections.forEach((section) => lanternObserver.observe(section));
    }

    const driftTargets = document.querySelectorAll('[data-scroll-drift]');
    if (driftTargets.length) {
      const visibleTargets = new Set();
      let driftFrame = 0;
      const updateDrift = () => {
        const viewportHeight = Math.max(window.innerHeight, 1);
        visibleTargets.forEach((target) => {
          const bounds = target.getBoundingClientRect();
          const distanceFromCenter = (bounds.top + bounds.height / 2 - viewportHeight / 2) / viewportHeight;
          const shift = Math.max(-20, Math.min(20, -distanceFromCenter * 24));
          target.style.setProperty('--scroll-drift-y', `${shift.toFixed(1)}px`);
        });
        driftFrame = 0;
      };
      const requestDriftUpdate = () => {
        if (driftFrame) return;
        driftFrame = window.requestAnimationFrame(updateDrift);
      };
      const driftObserver = new IntersectionObserver((entries) => {
        entries.forEach(({ target, isIntersecting }) => {
          if (isIntersecting) visibleTargets.add(target);
          else visibleTargets.delete(target);
        });
        requestDriftUpdate();
      }, { rootMargin: '120px 0px' });
      driftTargets.forEach((target) => driftObserver.observe(target));
      window.addEventListener('scroll', requestDriftUpdate, { passive: true });
      window.addEventListener('resize', requestDriftUpdate, { passive: true });
    }
  }
})();
