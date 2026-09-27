/* Privacy tab: consent, access request export, retention, right to erasure, per-candidate audit trail (req 2.10, 3.10.2). */
window.LHS = window.LHS || {};
LHS.tabs = LHS.tabs || {};

(function (LHS) {
  'use strict';
  const { html, fmtDate, fmtDateTime, fullName } = LHS.util;
  const D = LHS.domain;
  const { dialog, field, toast } = LHS.ui;

  // Privacy Act APP 12 access request: everything held about the candidate, minus encrypted secrets.
  async function exportData(c) {
    const copy = JSON.parse(JSON.stringify(c));
    if (copy.onboarding && copy.onboarding.bank) copy.onboarding.bank = { note: 'Bank details held (encrypted); provided on verified request', last4: copy.onboarding.bank.last4 };
    delete copy.version;
    copy.auditTrail = await LHS.store.fetchAuditLog(c.id);
    const blob = new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `candidate-data-${fullName(c).replace(/\W+/g, '-').toLowerCase()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    LHS.store.audit('Exported personal data (access request)', c.id, fullName(c));
  }

  const auditRows = (log) => html`${log.map((a) => html`<tr><td class="nowrap">${fmtDateTime(a.at)}</td><td>${a.user}</td><td>${a.action}</td><td>${a.details}</td></tr>`)}`;

  LHS.tabs.privacy = function (c, el) {
    const retention = D.retentionDue(c);

    el.innerHTML = html`
      <div class="grid-2">
        <section class="card">
          <h2>Consent</h2>
          <dl class="dl">
            <div class="dl-row"><dt>Consent</dt><dd>${c.consent.given ? html`<span class="badge badge-ok">Given</span>` : html`<span class="badge badge-bad">Not recorded</span>`}</dd></div>
            <div class="dl-row"><dt>Date</dt><dd>${fmtDate(c.consent.date)}</dd></div>
            <div class="dl-row"><dt>Method</dt><dd>${c.consent.method || '—'}</dd></div>
            <div class="dl-row"><dt>Collection notice</dt><dd>${c.consent.collectionNoticeProvided ? 'Provided' : 'Not provided'}</dd></div>
          </dl>
          <a class="btn btn-sm" href="#/candidates/${c.id}/edit">Update consent</a>
        </section>
        <section class="card">
          <h2>Data rights</h2>
          <p class="small">Retention: records are kept for ${D.RETENTION_YEARS} years after last activity (ATO requirement).
            Last activity: <strong>${fmtDate(c.updatedAt)}</strong>.
            ${retention ? html`<span class="badge badge-warn">Retention period ended</span>` : ''}</p>
          <div class="actions">
            <button type="button" class="btn btn-sm" data-action="export">Export data (access request)</button>
            <button type="button" class="btn btn-sm btn-danger" data-action="erase">Erase candidate…</button>
          </div>
        </section>
      </div>
      <section class="card">
        <h2>Audit trail</h2>
        <div class="table-wrap"><table class="table compact"><thead><tr><th>When</th><th>User</th><th>Action</th><th>Details</th></tr></thead>
          <tbody id="audit-rows"><tr><td colspan="4" class="muted">Loading…</td></tr></tbody>
        </table></div>
      </section>`.s;

    LHS.store.fetchAuditLog(c.id)
      .then((log) => { const body = el.querySelector('#audit-rows'); if (body) body.innerHTML = auditRows(log).s; })
      .catch((e) => toast(`Could not load the audit trail: ${e.message}`, 'error'));

    LHS.tabs.onAction(el, {
      export: () => exportData(c).catch((e) => toast(`Export failed: ${e.message}`, 'error')),
      erase: () => dialog({
        title: 'Erase candidate',
        body: html`<p>This permanently removes all personal information for <strong>${fullName(c)}</strong>. An anonymous record is kept so the audit trail stays intact.</p>
          <p class="muted small">Only erase when legally permitted. Records tied to tax, payroll or placements may need to be kept for ${D.RETENTION_YEARS} years.</p>
          <div class="form-grid">
            ${field({ name: 'reason', label: 'Reason / request reference', type: 'textarea', required: true, full: true })}
            ${field({ name: 'confirm', label: 'Type ERASE to confirm', required: true, attrs: 'pattern="ERASE" autocomplete="off"' })}
          </div>`,
        submitLabel: 'Erase permanently',
        danger: true,
        onSubmit: (v) => {
          LHS.store.eraseCandidate(c.id, v.reason);
          toast('Candidate erased', 'success');
          location.hash = '#/candidates';
        },
      }),
    });
  };
})(window.LHS);
