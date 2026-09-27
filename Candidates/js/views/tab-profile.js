/* Profile tab: summary, skills, certifications, LinkedIn outreach, status history (req 3.1.1, 3.1.5). */
window.LHS = window.LHS || {};
LHS.tabs = LHS.tabs || {};

(function (LHS) {
  'use strict';
  const { html, uid, fmtDate, fmtDateTime, fmtMoney, todayISO } = LHS.util;
  const D = LHS.domain;
  const { statusBadge, expiryBadge, dialog, field, empty } = LHS.ui;

  const OUTREACH_CHANNELS = ['InMail', 'Connection request', 'Email', 'Phone call'];

  const row = (label, value) => html`<div class="dl-row"><dt>${label}</dt><dd>${value || html`<span class="muted">—</span>`}</dd></div>`;

  LHS.tabs.profile = function (c, el, refresh) {
    const update = (...a) => LHS.tabs.update(c, refresh, ...a);
    const rtw = D.rightToWorkIssues(c);
    const cl = c.clearance;

    el.innerHTML = html`
      <div class="grid-2">
        <section class="card">
          <h2>Contact &amp; employment</h2>
          <dl class="dl">
            ${row('Email', c.email && html`<a href="mailto:${c.email}">${c.email}</a>`)}
            ${row('Phone', c.phone && html`<a href="tel:${c.phone.replace(/\s/g, '')}">${c.phone}</a>`)}
            ${row('Location', c.location)}
            ${row('Current employer', c.currentEmployer)}
            ${row('Current title', c.currentTitle)}
            ${row('ABN', c.abn && html`${D.formatABN(c.abn)} ${D.validABN(c.abn) ? html`<span class="badge badge-ok">Valid</span>` : html`<span class="badge badge-bad">Invalid</span>`}`)}
            ${row('Availability', c.availabilityDate && fmtDate(c.availabilityDate))}
            ${row('Expectation', c.salary.amount && `${fmtMoney(c.salary.amount)} (${c.salary.basis})`)}
          </dl>
        </section>

        <section class="card">
          <h2>Clearance &amp; right to work</h2>
          <dl class="dl">
            ${row('Clearance', cl.level === 'None' ? 'None' : html`<strong>${cl.level}</strong> · ${cl.verification === 'Verified' ? html`<span class="badge badge-ok">Verified</span>` : html`<span class="badge badge-warn">${cl.verification}</span>`}`)}
            ${cl.level !== 'None' ? row('Clearance expiry', expiryBadge(cl.expiry)) : ''}
            ${cl.level !== 'None' ? row('Issuing agency', cl.issuingAgency) : ''}
            ${row('Work rights', c.visa.workRights || html`<span class="badge badge-warn">Not checked</span>`)}
            ${c.visa.workRights === 'Visa holder' ? html`${row('Visa', c.visa.type)}${row('Visa expiry', expiryBadge(c.visa.expiry))}${row('Restrictions', c.visa.restrictions)}` : ''}
          </dl>
          ${rtw.length ? html`<ul class="blockers">${rtw.map((x) => html`<li>${x}</li>`)}</ul>` : ''}
        </section>

        <section class="card">
          <h2>Skills</h2>
          ${c.skills.length ? html`<div class="chips">${c.skills.map((s) => html`<span class="chip">${s.name}${s.years ? html` <span class="muted">${s.years}y</span>` : ''}</span>`)}</div>` : empty('No skills recorded.')}
          <h3>Certifications</h3>
          ${c.certifications.length ? html`<table class="table compact"><thead><tr><th>Certification</th><th>Issuer</th><th>Expiry</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>
            ${c.certifications.map((x) => html`<tr><td>${x.name}</td><td>${x.issuer}</td><td>${expiryBadge(x.expiry)}</td>
              <td class="num"><button type="button" class="link-btn danger" data-action="removeCert" data-id="${x.id}">Remove</button></td></tr>`)}
          </tbody></table>` : empty('No certifications recorded.')}
          <button type="button" class="btn btn-sm" data-action="addCert">Add certification</button>
        </section>

        <section class="card">
          <h2>Sourcing &amp; LinkedIn outreach</h2>
          <dl class="dl">
            ${row('Source', c.source.channel && `${c.source.channel}${c.source.detail ? ' – ' + c.source.detail : ''}`)}
            ${row('LinkedIn', c.linkedin.url && html`<a href="${LHS.util.safeUrl(c.linkedin.url)}" target="_blank" rel="noopener noreferrer">View profile ↗</a>`)}
            ${row('Outreach status', c.linkedin.outreachStatus)}
          </dl>
          ${c.outreachLog.length ? html`<table class="table compact"><thead><tr><th>Date</th><th>Channel</th><th>Outcome</th></tr></thead><tbody>
            ${c.outreachLog.slice().reverse().map((o) => html`<tr><td>${fmtDate(o.date)}</td><td>${o.channel}</td><td>${o.status}${o.note ? html`<div class="muted small">${o.note}</div>` : ''}</td></tr>`)}
          </tbody></table>` : ''}
          <button type="button" class="btn btn-sm" data-action="logOutreach">Log outreach</button>
        </section>
      </div>

      <div class="grid-2">
        <section class="card">
          <h2>Status history</h2>
          <ol class="timeline">
            ${c.statusHistory.slice().reverse().map((h) => html`<li>
              <div>${h.from ? html`${statusBadge(h.from)} → ` : ''}${statusBadge(h.to)}</div>
              <div class="muted small">${fmtDateTime(h.at)} · ${h.by}</div>
              ${h.reason ? html`<div class="small">${h.reason}</div>` : ''}
            </li>`)}
          </ol>
        </section>
        <section class="card">
          <h2>Internal notes</h2>
          ${c.notes ? html`<p class="prewrap">${c.notes}</p>` : empty('No notes.')}
        </section>
      </div>`.s;

    LHS.tabs.onAction(el, {
      addCert: () => dialog({
        title: 'Add certification',
        body: html`<div class="form-grid">
          ${field({ name: 'name', label: 'Certification', required: true, full: true })}
          ${field({ name: 'issuer', label: 'Issuer' })}
          ${field({ name: 'expiry', label: 'Expiry date', type: 'date', hint: 'Leave blank if it does not expire' })}
        </div>`,
        submitLabel: 'Add',
        onSubmit: (v) => update((x) => x.certifications.push({ id: uid(), ...v }), 'Added certification', v.name),
      }),
      removeCert: (id) => {
        const cert = c.certifications.find((x) => x.id === id);
        update((x) => { x.certifications = x.certifications.filter((y) => y.id !== id); }, 'Removed certification', cert && cert.name);
      },
      logOutreach: () => dialog({
        title: 'Log outreach',
        body: html`<div class="form-grid">
          ${field({ name: 'date', label: 'Date', type: 'date', value: todayISO(), required: true })}
          ${field({ name: 'channel', label: 'Channel', type: 'select', list: OUTREACH_CHANNELS, value: 'InMail' })}
          ${field({ name: 'status', label: 'Outreach status', type: 'select', list: D.OUTREACH, value: c.linkedin.outreachStatus === 'Not contacted' ? 'InMail sent' : c.linkedin.outreachStatus })}
          ${field({ name: 'note', label: 'Note', type: 'textarea', full: true })}
        </div>`,
        submitLabel: 'Save',
        onSubmit: (v) => update((x) => {
          x.outreachLog.push({ id: uid(), ...v });
          x.linkedin.outreachStatus = v.status;
        }, 'Logged outreach', `${v.channel}: ${v.status}`),
      }),
    });
  };
})(window.LHS);
