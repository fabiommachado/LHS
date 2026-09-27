/* Candidate compliance (expiring documents, consent, retention) and the module audit log (req 3.1.3, 3.9.2, 3.10.2). */
window.LHS = window.LHS || {};
LHS.views = LHS.views || {};

(function (LHS) {
  'use strict';
  const { html, fullName, fmtDate, fmtDateTime, debounce } = LHS.util;
  const D = LHS.domain;
  const { statusBadge, expiryBadge, empty } = LHS.ui;

  const BUCKETS = [
    { id: 'expired', label: 'Expired' },
    { id: '30', label: 'Within 30 days' },
    { id: '60', label: '31–60 days' },
    { id: '90', label: '61–90 days' },
  ];

  LHS.views.compliance = function (root) {
    // Do Not Use / Inactive candidates are excluded from expiry alerts; they aren't being placed.
    const all = LHS.store.listCandidates();
    const tracked = all.filter((c) => !['Inactive', 'Do Not Use'].includes(c.status));
    const items = tracked.flatMap((c) => D.expiryItems(c).map((i) => ({ ...i, c, bucket: D.expiryBucket(i.days) })));
    const noConsent = all.filter((c) => !c.consent.given);
    const noRtw = tracked.filter((c) => c.status !== 'Prospect' && D.rightToWorkIssues(c).length);
    const retention = all.filter(D.retentionDue);

    const itemTable = (list) => html`<table class="table compact"><thead><tr><th>Candidate</th><th>Status</th><th>Item</th><th>Expiry</th></tr></thead><tbody>
      ${list.map((i) => html`<tr><td><a href="#/candidates/${i.c.id}/documents">${fullName(i.c)}</a></td><td>${statusBadge(i.c.status)}</td><td>${i.label}</td><td>${expiryBadge(i.date)}</td></tr>`)}
    </tbody></table>`;

    const candTable = (list, note) => (list.length ? html`<table class="table compact"><thead><tr><th>Candidate</th><th>Status</th><th>Detail</th></tr></thead><tbody>
      ${list.map((c) => html`<tr><td><a href="#/candidates/${c.id}">${fullName(c)}</a></td><td>${statusBadge(c.status)}</td><td class="small">${note(c)}</td></tr>`)}
    </tbody></table>` : empty('None.'));

    root.innerHTML = html`
      <div class="page-head"><h1 tabindex="-1">Candidate compliance</h1></div>
      <p class="muted">Visas, clearances, certifications, police/WWVP checks and documents expiring in the next 90 days, using the 30/60/90-day alert windows. Inactive and Do Not Use candidates aren't included.</p>
      <div class="grid-2">
        ${BUCKETS.map((b) => {
          const list = items.filter((i) => i.bucket === b.id);
          return html`<section class="card ${b.id === 'expired' && list.length ? 'card-danger' : ''}">
            <h2>${b.label} <span class="count">${list.length}</span></h2>
            ${list.length ? itemTable(list) : empty('Nothing in this window.')}
          </section>`;
        })}
        <section class="card"><h2>Missing privacy consent <span class="count">${noConsent.length}</span></h2>
          ${candTable(noConsent, (c) => `Source: ${c.source.channel || 'unknown'}`)}</section>
        <section class="card"><h2>Right-to-work issues <span class="count">${noRtw.length}</span></h2>
          ${candTable(noRtw, (c) => D.rightToWorkIssues(c).join('; '))}</section>
        <section class="card"><h2>Retention period ended <span class="count">${retention.length}</span></h2>
          <p class="muted small">No activity for ${D.RETENTION_YEARS}+ years. Review for deletion.</p>
          ${candTable(retention, (c) => `Last activity ${fmtDate(c.updatedAt)}`)}</section>
      </div>`.s;
    return 'Compliance';
  };

  LHS.views.audit = function (root) {
    let log = [];
    const names = Object.fromEntries(LHS.store.listCandidates().map((c) => [c.id, fullName(c)]));
    root.innerHTML = html`
      <div class="page-head"><h1 tabindex="-1">Audit log</h1></div>
      <p class="muted">Every create, update, delete and view of candidate data, with the user and time.</p>
      <div class="filters card"><div class="field grow"><label for="audit-q">Filter</label><input id="audit-q" type="search" placeholder="User, action, candidate…"></div></div>
      <div class="table-wrap card"><table class="table compact"><thead><tr><th>When</th><th>User</th><th>Action</th><th>Candidate</th><th>Details</th></tr></thead>
        <tbody id="audit-rows"></tbody></table></div>`.s;

    const rowsEl = root.querySelector('#audit-rows');
    const draw = (q) => {
      const t = q.toLowerCase();
      const list = log.filter((a) => !t || [a.user, a.action, a.details, names[a.candidateId]].join(' ').toLowerCase().includes(t)).slice(0, 500);
      rowsEl.innerHTML = html`${list.map((a) => html`<tr>
        <td class="nowrap">${fmtDateTime(a.at)}</td><td>${a.user}</td><td>${a.action}</td>
        <td>${a.candidateId ? (names[a.candidateId] ? html`<a href="#/candidates/${a.candidateId}">${names[a.candidateId]}</a>` : html`<span class="muted">[erased]</span>`) : ''}</td>
        <td class="small">${a.details}</td></tr>`)}`.s || html`<tr><td colspan="5">${empty('No entries.')}</td></tr>`.s;
    };
    const input = root.querySelector('#audit-q');
    input.addEventListener('input', debounce((e) => draw(e.target.value), 150));
    rowsEl.innerHTML = html`<tr><td colspan="5" class="muted">Loading…</td></tr>`.s;
    LHS.store.fetchAuditLog()
      .then((entries) => { log = entries; if (rowsEl.isConnected) draw(input.value); })
      .catch((e) => LHS.ui.toast(`Could not load the audit log: ${e.message}`, 'error'));
    return 'Audit log';
  };
})(window.LHS);
