/* Duplicate detection and merge (req 3.1.1). */
window.LHS = window.LHS || {};
LHS.views = LHS.views || {};

(function (LHS) {
  'use strict';
  const { html, raw, fullName, fmtDate } = LHS.util;
  const { statusBadge, dialog, empty, toast } = LHS.ui;

  const summary = (c) => html`<div class="dup-side">
    <a href="#/candidates/${c.id}"><strong>${fullName(c)}</strong></a> ${statusBadge(c.status)}
    <div class="small">${c.email || '—'} · ${c.phone || '—'}</div>
    <div class="small muted">${c.currentTitle} ${c.currentEmployer ? '@ ' + c.currentEmployer : ''} · ${c.location}</div>
    <div class="small muted">Source: ${c.source.channel || '—'} · created ${fmtDate(c.createdAt)} · ${c.screenings.length} screening(s), ${c.documents.length} document(s)</div>
  </div>`;

  LHS.views.duplicates = function (root) {
    const pairs = LHS.domain.findDuplicatePairs(LHS.store.listCandidates());
    root.innerHTML = html`
      <div class="page-head"><h1 tabindex="-1">Possible duplicates</h1></div>
      <p class="muted">Matched on email, phone, LinkedIn profile, or name plus employer/location. Merging keeps the primary record's values, fills its blanks from the duplicate, and combines history, screenings, references and documents.</p>
      ${pairs.length ? pairs.map((p, i) => html`<section class="card dup">
        <div class="dup-reasons">${p.reasons.map((r) => html`<span class="badge badge-warn">${r}</span>`)}</div>
        <div class="dup-pair">${summary(p.a)}${summary(p.b)}</div>
        <button type="button" class="btn btn-sm btn-primary" data-merge="${i}">Merge…</button>
      </section>`) : empty('No duplicate candidates detected.')}`.s;

    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-merge]');
      if (!b) return;
      const { a, b: other } = pairs[Number(b.dataset.merge)];
      // Default primary: the record furthest through the workflow, then the older one.
      const rank = (c) => LHS.domain.STATUSES.indexOf(c.status);
      const defaultA = rank(a) !== rank(other) ? rank(a) > rank(other) : a.createdAt <= other.createdAt;
      dialog({
        title: 'Merge candidates',
        body: html`<fieldset><legend>Keep as primary record</legend>
          ${[a, other].map((c, i) => html`<div class="field-check"><input type="radio" id="prim-${i}" name="primary" value="${c.id}" ${(i === 0) === defaultA ? raw('checked') : ''}>
            <label for="prim-${i}">${fullName(c)} – ${c.status}, ${c.email || c.phone || 'no contact'} (source: ${c.source.channel || '—'})</label></div>`)}
          </fieldset><p class="muted small">The other record is removed once merged. You can't undo this.</p>`,
        submitLabel: 'Merge',
        onSubmit: (v) => {
          const secondary = v.primary === a.id ? other.id : a.id;
          LHS.store.mergeInto(v.primary, secondary);
          toast('Candidates merged', 'success');
          location.hash = `#/candidates/${v.primary}`;
        },
      });
    });
    return 'Duplicates';
  };
})(window.LHS);
