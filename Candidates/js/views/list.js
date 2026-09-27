/* Candidate search and list. Filters are mirrored into the URL so views are linkable. */
window.LHS = window.LHS || {};
LHS.views = LHS.views || {};

(function (LHS) {
  'use strict';
  const { html, fullName, fmtDate, debounce } = LHS.util;
  const { STATUSES, CLEARANCE_LEVELS, SOURCES } = LHS.domain;
  const { statusBadge, options, empty } = LHS.ui;

  const CLEARANCE_RANK = Object.fromEntries(CLEARANCE_LEVELS.map((l, i) => [l, i]));

  function matches(c, f) {
    if (f.status && c.status !== f.status) return false;
    // "min clearance": candidate must hold the selected level or higher.
    if (f.clearance && (CLEARANCE_RANK[c.clearance.level] || 0) < CLEARANCE_RANK[f.clearance]) return false;
    if (f.source === '(none)') { if (c.source.channel) return false; }
    else if (f.source && c.source.channel !== f.source) return false;
    if (f.available && c.availabilityDate && c.availabilityDate > f.available) return false;
    if (f.q) {
      const hay = [fullName(c), c.email, c.currentEmployer, c.currentTitle, c.location, ...c.skills.map((s) => s.name), ...c.certifications.map((x) => x.name)]
        .join(' ').toLowerCase();
      if (!f.q.toLowerCase().split(/\s+/).every((t) => hay.includes(t))) return false;
    }
    return true;
  }

  function rows(list) {
    if (!list.length) return html`<tr><td colspan="7">${empty('No candidates match these filters.')}</td></tr>`;
    return html`${list.map((c) => html`
      <tr>
        <td><a href="#/candidates/${c.id}"><strong>${fullName(c)}</strong></a><div class="muted small">${c.currentTitle}${c.currentEmployer ? ' · ' + c.currentEmployer : ''}</div></td>
        <td>${statusBadge(c.status)}${c.consent.given ? '' : html` <span class="badge badge-warn" title="Privacy consent not recorded">No consent</span>`}</td>
        <td>${c.clearance.level === 'None' ? html`<span class="muted">None</span>` : c.clearance.level}</td>
        <td class="skills-cell">${c.skills.slice(0, 4).map((s) => html`<span class="chip">${s.name}</span>`)}${c.skills.length > 4 ? html`<span class="muted small">+${c.skills.length - 4}</span>` : ''}</td>
        <td>${c.location}</td>
        <td>${c.availabilityDate ? fmtDate(c.availabilityDate) : '—'}</td>
        <td>${c.source.channel || html`<span class="muted">—</span>`}</td>
      </tr>`)}`;
  }

  LHS.views.list = function (root, params) {
    const f = { q: params.q || '', status: params.status || '', clearance: params.clearance || '', source: params.source || '', available: params.available || '' };

    root.innerHTML = html`
      <div class="page-head">
        <h1 tabindex="-1">Candidates</h1>
        <div class="actions">
          <a class="btn" href="#/candidates/new?source=LinkedIn">Import from LinkedIn</a>
          <a class="btn btn-primary" href="#/candidates/new">New candidate</a>
        </div>
      </div>
      <form class="filters card" role="search" aria-label="Filter candidates">
        <div class="field grow"><label for="flt-q">Search</label><input id="flt-q" name="q" type="search" value="${f.q}" placeholder="Name, skill, employer, certification…"></div>
        <div class="field"><label for="flt-status">Status</label><select id="flt-status" name="status">${options(STATUSES, f.status, 'Any')}</select></div>
        <div class="field"><label for="flt-cl">Min. clearance</label><select id="flt-cl" name="clearance">${options(CLEARANCE_LEVELS.slice(1), f.clearance, 'Any')}</select></div>
        <div class="field"><label for="flt-src">Source</label><select id="flt-src" name="source">${options([...SOURCES, '(none)'], f.source, 'Any')}</select></div>
        <div class="field"><label for="flt-av">Available by</label><input id="flt-av" name="available" type="date" value="${f.available}"></div>
        <div class="field field-btn"><button type="reset" class="btn">Clear</button></div>
      </form>
      <p class="muted small" id="result-count" aria-live="polite"></p>
      <div class="table-wrap card">
        <table class="table">
          <thead><tr><th>Candidate</th><th>Status</th><th>Clearance</th><th>Skills</th><th>Location</th><th>Available</th><th>Source</th></tr></thead>
          <tbody id="cand-rows"></tbody>
        </table>
      </div>`.s;

    const form = root.querySelector('.filters');
    const refresh = () => {
      Object.assign(f, LHS.util.formData(form));
      const list = LHS.store.listCandidates().filter((c) => matches(c, f))
        .sort((a, b) => fullName(a).localeCompare(fullName(b)));
      root.querySelector('#cand-rows').innerHTML = rows(list).s;
      root.querySelector('#result-count').textContent = `${list.length} candidate${list.length === 1 ? '' : 's'}`;
      const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
      history.replaceState(null, '', '#/candidates' + (qs ? '?' + qs : ''));
    };
    form.addEventListener('input', debounce(refresh, 150));
    form.addEventListener('change', refresh);
    form.addEventListener('reset', () => setTimeout(refresh));
    form.addEventListener('submit', (e) => e.preventDefault());
    refresh();
    return 'Candidates';
  };
})(window.LHS);
