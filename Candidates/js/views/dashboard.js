/* Recruitment dashboard for the candidate module (pipeline, compliance, sourcing). */
window.LHS = window.LHS || {};
LHS.views = LHS.views || {};

(function (LHS) {
  'use strict';
  const { html, fullName, fmtDate, daysUntil } = LHS.util;
  const { STATUSES, SOURCES, expiryItems, expiryBucket, findDuplicatePairs } = LHS.domain;
  const { statusBadge, expiryBadge, empty, slug } = LHS.ui;

  LHS.views.dashboard = function (root) {
    const all = LHS.store.listCandidates();
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, all.filter((c) => c.status === s).length]));
    const maxStatus = Math.max(1, ...Object.values(byStatus));

    const expiring = all.flatMap((c) => expiryItems(c).map((i) => ({ ...i, c })))
      .filter((i) => ['expired', '30', '60', '90'].includes(expiryBucket(i.days)));
    const noConsent = all.filter((c) => !(c.consent && c.consent.given) && c.status !== 'Do Not Use');
    const dupes = findDuplicatePairs(all);

    // Available soon: pool candidates (Cleared/Bench) free within 14 days.
    const available = all.filter((c) => ['Cleared', 'Bench'].includes(c.status))
      .filter((c) => !c.availabilityDate || daysUntil(c.availabilityDate) <= 14)
      .sort((a, b) => (a.availabilityDate || '').localeCompare(b.availabilityDate || ''));

    // Sourcing effectiveness (req 3.9.2): sourced / progressed past screening / placed per channel.
    const placedStates = ['Placed', 'Active'];
    const progressedStates = ['Cleared', 'Submitted', 'Shortlisted', 'Placed', 'Active', 'Bench'];
    const sourcing = [...SOURCES, ''].map((ch) => {
      const list = all.filter((c) => (c.source && c.source.channel || '') === ch);
      return { ch: ch || 'Unknown', n: list.length, progressed: list.filter((c) => progressedStates.includes(c.status)).length, placed: list.filter((c) => placedStates.includes(c.status)).length };
    }).filter((r) => r.n);

    root.innerHTML = html`
      <div class="page-head">
        <h1 tabindex="-1">Candidate dashboard</h1>
        <div class="actions">
          <a class="btn" href="#/candidates/new?source=LinkedIn">Import from LinkedIn</a>
          <a class="btn btn-primary" href="#/candidates/new">New candidate</a>
        </div>
      </div>

      <section class="kpis" aria-label="Key figures">
        <a class="kpi" href="#/candidates"><span class="kpi-n">${all.length}</span><span class="kpi-l">Candidates</span></a>
        <a class="kpi" href="#/candidates?status=Active"><span class="kpi-n">${byStatus.Active + byStatus.Placed}</span><span class="kpi-l">Placed / active</span></a>
        <a class="kpi" href="#/candidates?status=Bench"><span class="kpi-n">${byStatus.Bench + byStatus.Cleared}</span><span class="kpi-l">Cleared / bench pool</span></a>
        <a class="kpi ${expiring.length ? 'kpi-warn' : ''}" href="#/compliance"><span class="kpi-n">${expiring.length}</span><span class="kpi-l">Expiring ≤ 90 days</span></a>
        <a class="kpi ${noConsent.length ? 'kpi-warn' : ''}" href="#/compliance"><span class="kpi-n">${noConsent.length}</span><span class="kpi-l">Missing consent</span></a>
        <a class="kpi ${dupes.length ? 'kpi-warn' : ''}" href="#/duplicates"><span class="kpi-n">${dupes.length}</span><span class="kpi-l">Possible duplicates</span></a>
      </section>

      <div class="grid-2">
        <section class="card">
          <h2>Pipeline by status</h2>
          <ul class="bars">
            ${STATUSES.map((s) => html`
              <li><a href="#/candidates?status=${encodeURIComponent(s)}">
                <span class="bar-label">${s}</span>
                <span class="bar-track"><span class="bar-fill status-${slug(s)}" style="width:${(byStatus[s] / maxStatus) * 100}%"></span></span>
                <span class="bar-n">${byStatus[s]}</span>
              </a></li>`)}
          </ul>
        </section>

        <section class="card">
          <h2>Available within 14 days</h2>
          ${available.length ? html`
            <table class="table compact"><thead><tr><th>Candidate</th><th>Status</th><th>Clearance</th><th>Available</th></tr></thead>
            <tbody>${available.map((c) => html`<tr>
              <td><a href="#/candidates/${c.id}">${fullName(c)}</a><div class="muted small">${c.currentTitle}</div></td>
              <td>${statusBadge(c.status)}</td><td>${c.clearance.level}</td><td>${c.availabilityDate ? fmtDate(c.availabilityDate) : 'Now'}</td>
            </tr>`)}</tbody></table>` : empty('No cleared or bench candidates available in the next 14 days.')}
        </section>

        <section class="card">
          <h2>Expiring documents &amp; checks</h2>
          ${expiring.length ? html`
            <table class="table compact"><thead><tr><th>Candidate</th><th>Item</th><th>Expiry</th></tr></thead>
            <tbody>${expiring.slice(0, 8).map((i) => html`<tr>
              <td><a href="#/candidates/${i.c.id}">${fullName(i.c)}</a></td><td>${i.label}</td><td>${expiryBadge(i.date)}</td>
            </tr>`)}</tbody></table>
            ${expiring.length > 8 ? html`<p><a href="#/compliance">View all ${expiring.length}</a></p>` : ''}` : empty('Nothing expires in the next 90 days.')}
        </section>

        <section class="card">
          <h2>Sourcing effectiveness</h2>
          <table class="table compact"><thead><tr><th>Source</th><th class="num">Sourced</th><th class="num">Past screening</th><th class="num">Placed</th></tr></thead>
          <tbody>${sourcing.map((r) => html`<tr>
            <td><a href="#/candidates?source=${encodeURIComponent(r.ch === 'Unknown' ? '(none)' : r.ch)}">${r.ch}</a></td>
            <td class="num">${r.n}</td><td class="num">${r.progressed}</td><td class="num">${r.placed}</td>
          </tr>`)}</tbody></table>
        </section>
      </div>`.s;
    return 'Dashboard';
  };
})(window.LHS);
