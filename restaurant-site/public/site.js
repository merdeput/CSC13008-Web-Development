(() => {
  const root = document.documentElement;
  root.classList.remove('no-js');
  root.classList.add('js');

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
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
      if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;

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
