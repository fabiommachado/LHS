/* Candidate record: header, status workflow (req 3.1.5) and tabbed sections. */
window.LHS = window.LHS || {};
LHS.views = LHS.views || {};
LHS.tabs = LHS.tabs || {};

(function (LHS) {
  'use strict';
  const { html, fullName } = LHS.util;
  const D = LHS.domain;
  const { statusBadge, dialog, toast, field } = LHS.ui;

  const TABS = [
    { id: 'profile', label: 'Profile' },
    { id: 'screening', label: 'Screening & checks' },
    { id: 'onboarding', label: 'Onboarding' },
    { id: 'documents', label: 'Documents' },
    { id: 'privacy', label: 'Privacy & audit' },
  ];

  let lastViewed = null;

  function statusDialog(c, to, refresh) {
    const blockers = D.transitionBlockers(c, to);
    const needsReason = ['Do Not Use', 'Inactive'].includes(to);
    dialog({
      title: `Move to ${to}`,
      body: blockers.length
        ? html`<p><strong>${fullName(c)}</strong> can't move to <strong>${to}</strong> yet:</p>
            <ul class="blockers">${blockers.map((b) => html`<li>${b}</li>`)}</ul>`
        : html`<p>Change status from ${statusBadge(c.status)} to ${statusBadge(to)}.</p>
            ${field({ name: 'reason', label: needsReason ? 'Reason' : 'Note (optional)', type: 'textarea', required: needsReason, full: true })}
            ${to === 'Do Not Use' ? html`<p class="muted small">Do Not Use is final. The candidate is excluded from all searches and submissions.</p>` : ''}`,
      submitLabel: blockers.length ? null : `Move to ${to}`,
      danger: to === 'Do Not Use',
      onSubmit: (v) => {
        LHS.store.changeStatus(c.id, to, v.reason);
        toast(`${fullName(c)} moved to ${to}`, 'success');
        refresh();
      },
    });
  }

  function workflowBar(c) {
    const idx = D.STATUSES.indexOf(c.status);
    const main = D.STATUSES.slice(0, 8);
    return html`<ol class="workflow" aria-label="Status workflow">
      ${main.map((s, i) => html`<li class="${s === c.status ? 'current' : i < idx && idx < 8 ? 'done' : ''}" ${s === c.status ? LHS.util.raw('aria-current="step"') : ''}>${s}</li>`)}
    </ol>`;
  }

  LHS.views.detail = function (root, params) {
    const c = LHS.store.getCandidate(params.id);
    if (!c) {
      root.innerHTML = html`<h1 tabindex="-1">Candidate not found</h1><p>The record may have been merged or erased. <a href="#/candidates">Back to candidates</a></p>`.s;
      return 'Not found';
    }
    if (lastViewed !== c.id) { LHS.store.audit('Viewed candidate', c.id, fullName(c)); lastViewed = c.id; }
    const tab = TABS.some((t) => t.id === params.tab) ? params.tab : 'profile';
    const refresh = () => LHS.app.render();
    const next = D.allowedTransitions(c);

    root.innerHTML = html`
      <nav class="crumbs" aria-label="Breadcrumb"><a href="#/candidates">Candidates</a> › <span>${fullName(c)}</span></nav>
      <div class="page-head">
        <div>
          <h1 tabindex="-1">${fullName(c)} ${statusBadge(c.status)}</h1>
          <p class="muted">${c.currentTitle}${c.currentEmployer ? ' · ' + c.currentEmployer : ''}${c.location ? ' · ' + c.location : ''}</p>
        </div>
        <div class="actions">
          <a class="btn" href="#/candidates/${c.id}/edit">Edit profile</a>
          ${next.length ? html`<div class="menu">
            <button type="button" class="btn btn-primary" aria-haspopup="true" aria-expanded="false" data-menu>Change status ▾</button>
            <ul class="menu-list" role="menu" hidden>
              ${next.map((s) => html`<li role="none"><button type="button" role="menuitem" data-status="${s}">${s}</button></li>`)}
            </ul></div>` : ''}
        </div>
      </div>
      ${c.consent.given ? '' : html`<div class="callout callout-warn">No privacy consent recorded. This candidate can't progress past <em>Prospect</em> until consent is captured. <a href="#/candidates/${c.id}/edit">Record consent</a></div>`}
      ${c.status === 'Do Not Use' ? html`<div class="callout callout-danger">Marked <strong>Do Not Use</strong>. ${(c.statusHistory.slice(-1)[0] || {}).reason || ''}</div>` : ''}
      ${workflowBar(c)}
      <div class="tabs" role="tablist" aria-label="Candidate sections">
        ${TABS.map((t) => html`<a role="tab" href="#/candidates/${c.id}/${t.id}" aria-selected="${String(t.id === tab)}" class="${t.id === tab ? 'active' : ''}">${t.label}</a>`)}
      </div>
      <section id="tab-panel" role="tabpanel" aria-label="${TABS.find((t) => t.id === tab).label}"></section>`.s;

    // Status menu
    const menuBtn = root.querySelector('[data-menu]');
    if (menuBtn) {
      const list = menuBtn.nextElementSibling;
      const toggle = (open) => { list.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open)); };
      menuBtn.addEventListener('click', () => { toggle(list.hidden); if (!list.hidden) list.querySelector('button').focus(); });
      list.addEventListener('keydown', (e) => { if (e.key === 'Escape') { toggle(false); menuBtn.focus(); } });
      const outside = (e) => {
        if (!menuBtn.isConnected) { document.removeEventListener('click', outside); return; }
        if (!e.target.closest('.menu')) toggle(false);
      };
      document.addEventListener('click', outside);
      list.addEventListener('click', (e) => {
        const b = e.target.closest('[data-status]');
        if (b) { toggle(false); statusDialog(c, b.dataset.status, refresh); }
      });
    }

    LHS.tabs[tab](c, root.querySelector('#tab-panel'), refresh);
    return fullName(c);
  };

  // Shared by tabs: mutate the stored candidate, then re-render.
  LHS.tabs.update = (c, refresh, mutate, action, details) => {
    LHS.store.updateCandidate(c.id, mutate, action, details);
    refresh();
  };

  // Delegated click handling for [data-action] buttons within a tab.
  LHS.tabs.onAction = (el, handlers) => {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-action]');
      if (b && handlers[b.dataset.action]) { e.preventDefault(); handlers[b.dataset.action](b.dataset.id, b); }
    });
  };
})(window.LHS);
