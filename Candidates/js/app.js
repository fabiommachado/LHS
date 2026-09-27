/* SPA shell: hash router, navigation, role switch. */
window.LHS = window.LHS || {};

(function (LHS) {
  'use strict';
  const { html } = LHS.util;

  const NAV = [
    { href: '#/', label: 'Dashboard', match: (p) => p.length === 0 },
    { href: '#/candidates', label: 'Candidates', match: (p) => p[0] === 'candidates' },
    { href: '#/questionnaires', label: 'Questionnaires', match: (p) => p[0] === 'questionnaires' },
    { href: '#/duplicates', label: 'Duplicates', match: (p) => p[0] === 'duplicates' },
    { href: '#/compliance', label: 'Compliance', match: (p) => p[0] === 'compliance' },
    { href: '#/audit', label: 'Audit log', match: (p) => p[0] === 'audit' },
  ];

  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, query] = raw.split('?');
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    const params = Object.fromEntries(new URLSearchParams(query || ''));
    return { parts, params };
  }

  // Maps path segments to a view and its params.
  function resolve(parts, params) {
    const [a, b, c] = parts;
    if (!a) return ['dashboard', params];
    if (a === 'candidates') {
      if (!b) return ['list', params];
      if (b === 'new') return ['form', params];
      if (c === 'edit') return ['form', { ...params, id: b }];
      return ['detail', { ...params, id: b, tab: c }];
    }
    if (['questionnaires', 'duplicates', 'compliance', 'audit', 'portal'].includes(a) && !b) return [a, params];
    return [null, params];
  }

  function renderHeader(parts) {
    const s = LHS.store.session();
    const recruiter = s.role !== 'candidate';
    document.getElementById('main-nav').innerHTML = recruiter
      ? html`${NAV.map((n) => html`<a href="${n.href}" ${n.match(parts) ? LHS.util.raw('aria-current="page"') : ''}>${n.label}</a>`)}`.s
      : html`<a href="#/portal" aria-current="page">My profile</a>`.s;
    const sel = document.getElementById('role-switch');
    sel.value = recruiter ? 'recruiter' : 'candidate';
  }

  function render() {
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    const { parts, params } = parseHash();
    const session = LHS.store.session();

    // Candidates may only use the portal (RBAC, req 3.10.1).
    if (session.role === 'candidate' && parts[0] !== 'portal') { location.replace('#/portal'); return; }

    const [viewName, viewParams] = resolve(parts, params);
    renderHeader(parts);
    const main = document.getElementById('main');
    const container = document.createElement('div'); // fresh node per render so view listeners never pile up
    main.replaceChildren(container);

    let title;
    if (!viewName || !LHS.views[viewName]) {
      container.innerHTML = html`<h1 tabindex="-1">Page not found</h1><p><a href="#/">Go to the dashboard</a></p>`.s;
      title = 'Not found';
    } else {
      try {
        title = LHS.views[viewName](container, viewParams);
      } catch (err) {
        console.error(err);
        container.innerHTML = html`<h1 tabindex="-1">Something went wrong</h1><p class="errors">${err.message}</p>`.s;
        title = 'Error';
      }
    }
    document.title = `${title} · Candidates · LHS`;
    // Move focus to the new page heading so screen-reader and keyboard users land on the new content (WCAG 2.4.3).
    const h1 = container.querySelector('h1');
    if (h1 && LHS.app.navigated) h1.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    LHS.app.navigated = true;
  }

  function init() {
    LHS.store.load();

    // The skip link can't use href="#main" because the hash drives routing.
    document.querySelector('.skip-link').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('main').focus();
    });

    document.getElementById('role-switch').addEventListener('change', (e) => {
      if (e.target.value === 'candidate') {
        LHS.store.setSession({ role: 'candidate', candidateId: null });
        location.hash = '#/portal';
      } else {
        LHS.store.setSession({ role: 'recruiter', candidateId: null });
        location.hash = '#/';
      }
      render();
    });

    document.getElementById('reset-demo').addEventListener('click', () => {
      LHS.ui.confirmDialog('Reset demo data', 'Replace all candidate data in this browser with the demo data set?', 'Reset', () => {
        LHS.store.resetDemoData();
        location.hash = '#/';
        render();
        LHS.ui.toast('Demo data restored', 'success');
      }, true);
    });

    window.addEventListener('hashchange', render);
    render();
  }

  LHS.app = { render, navigated: false };
  document.addEventListener('DOMContentLoaded', init);
})(window.LHS);
