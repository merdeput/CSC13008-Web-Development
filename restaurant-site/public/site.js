(() => {
  const root = document.documentElement;
  root.classList.remove('no-js');
  root.classList.add('js');

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const toggle = document.querySelector('.mobile-nav-toggle');
  const navigation = document.getElementById('primary-navigation');
  const pageTransition = document.querySelector('.page-transition');

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
      window.setTimeout(() => window.location.assign(destination.href), 240);
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
        const enteringFromTop = scrollDirection === 'up';
        target.classList.toggle('reveal-enter-from-top', enteringFromTop);
        target.classList.toggle('reveal-enter-from-bottom', !enteringFromTop);
        target.style.setProperty('--reveal-offset', enteringFromTop ? '-42px' : '42px');
        if (target.classList.contains('reveal-card')) {
          target.style.setProperty('--card-hidden-y', enteringFromTop ? '-48px' : '48px');
        }
        target.classList.add('is-visible');
      });
    }, { threshold: [0, 0.06], rootMargin: '12% 0px 12% 0px' });

    let revealIndex = 0;
    let cardIndex = 0;
    revealTargets.forEach((element) => {
      const isCard = element.matches('.dish-card, .chef-mini, .chef-profile');
      const isIllustration = element.matches('.story-art, .hero-photo, .cta-ornament');
      element.style.setProperty('--reveal-delay', `${(revealIndex++ % 5) * 55}ms`);

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

  const homeHero = document.querySelector('.home-hero');
  if (homeHero && !reducedMotion.matches) {
    let scrollFrame = 0;
    const updateHeroParallax = () => {
      if (scrollFrame) return;
      scrollFrame = window.requestAnimationFrame(() => {
        const shift = -Math.min(window.scrollY, 560) * 0.045;
        homeHero.style.setProperty('--hero-scroll-shift', `${shift.toFixed(1)}px`);
        scrollFrame = 0;
      });
    };
    updateHeroParallax();
    window.addEventListener('scroll', updateHeroParallax, { passive: true });
    window.addEventListener('resize', updateHeroParallax, { passive: true });
  }
})();
