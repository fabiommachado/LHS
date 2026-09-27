/* Onboarding tab: compliance documents, bank (encrypted) & super details, inductions, contractor agreement (req 3.1.3). */
window.LHS = window.LHS || {};
LHS.tabs = LHS.tabs || {};

(function (LHS) {
  'use strict';
  const { html, uid, fmtDate, fmtMoney, fullName, todayISO } = LHS.util;
  const D = LHS.domain;
  const { dialog, field, toast, confirmDialog } = LHS.ui;

  // Printable agreement. Clauses are placeholders pending legal review; e-signature (DocuSign/Adobe Sign) is Module 10.3.
  function agreementHtml(c) {
    const { esc } = LHS.util;
    const today = fmtDate(todayISO());
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Contractor Agreement – ${esc(fullName(c))}</title>
      <style>body{font:14px/1.6 Georgia,serif;max-width:760px;margin:40px auto;padding:0 24px;color:#111}h1{font-size:22px}h2{font-size:16px;margin-top:28px}
      table{border-collapse:collapse;width:100%}td{border:1px solid #999;padding:6px 10px}.sig{display:flex;gap:40px;margin-top:48px}.sig div{flex:1;border-top:1px solid #111;padding-top:6px}
      .draft{color:#b00;font-weight:bold}@media print{.noprint{display:none}}</style></head><body>
      <p class="noprint"><button onclick="print()">Print / save as PDF</button></p>
      <p class="draft">DRAFT TEMPLATE – clauses require legal review before use</p>
      <h1>Contractor Agreement</h1><p>Date: ${esc(today)}</p>
      <h2>1. Parties</h2>
      <table><tr><td>Agency</td><td>[Agency legal name], ABN [agency ABN], ACT Labour Hire Licence [licence no.]</td></tr>
      <tr><td>Contractor</td><td>${esc(fullName(c))}${c.abn ? ', ABN ' + esc(D.formatABN(c.abn)) : ''}</td></tr>
      <tr><td>Address / contact</td><td>${esc(c.location)} · ${esc(c.email)} · ${esc(c.phone)}</td></tr></table>
      <h2>2. Engagement</h2><p>The Contractor will be placed with clients of the Agency under assignment schedules issued for each placement,
      setting out the client, role, location, start and end dates, hours and pay rate.</p>
      <table><tr><td>Indicative rate</td><td>${c.salary.amount ? esc(fmtMoney(c.salary.amount) + ' (' + c.salary.basis + ')') : '[per assignment schedule]'}</td></tr>
      <tr><td>Security clearance held</td><td>${esc(c.clearance.level)}</td></tr></table>
      <h2>3. Obligations</h2><p>[Confidentiality, security, WHS, conflict of interest, intellectual property, insurance and termination clauses.]</p>
      <h2>4. Privacy</h2><p>Personal information is handled in accordance with the Privacy Act 1988 (Cth) and the Agency's privacy policy.</p>
      <div class="sig"><div>Agency representative</div><div>Contractor: ${esc(fullName(c))}</div></div></body></html>`;
  }

  LHS.tabs.onboarding = function (c, el, refresh) {
    const update = (...a) => LHS.tabs.update(c, refresh, ...a);
    const ob = c.onboarding;
    const gate = D.gateIssues(c, 'Active');
    const inductionsByType = Object.fromEntries(c.inductions.map((i) => [i.type, i]));
    const agreement = ob.agreement || { status: 'Not generated' };

    el.innerHTML = html`
      <section class="card ${gate.length ? 'card-warn' : 'card-ok'}">
        <h2>Readiness for <em>Active</em></h2>
        ${gate.length ? html`<ul class="blockers">${gate.map((b) => html`<li>${b}</li>`)}</ul>` : html`<p>✓ Onboarding is complete.</p>`}
      </section>

      <div class="grid-2">
        <section class="card">
          <h2>Compliance documents</h2>
          <ul class="checklist">
            ${D.ONBOARDING_DOCS.map((t) => html`<li class="${D.hasDoc(c, t) ? 'ok' : 'missing'}">${D.hasDoc(c, t) ? '✓' : '✗'} ${t}</li>`)}
          </ul>
          <a class="btn btn-sm" href="#/candidates/${c.id}/documents">Manage documents</a>
        </section>

        <section class="card">
          <h2>Bank details <span class="badge badge-ok" title="AES-256-GCM">Encrypted</span></h2>
          ${ob.bank && ob.bank.last4 ? html`
            <dl class="dl"><div class="dl-row"><dt>Account</dt><dd id="bank-display">BSB ***-*** · Acct ****${ob.bank.last4}</dd></div></dl>
            <button type="button" class="btn btn-sm" data-action="revealBank">Reveal</button>
            <button type="button" class="btn btn-sm" data-action="editBank">Replace</button>`
            : html`<p class="muted">Not recorded.</p><button type="button" class="btn btn-sm" data-action="editBank">Add bank details</button>`}
          <p class="muted small">Revealing bank details is recorded in the audit log.</p>
        </section>

        <form class="card" id="super-form">
          <h2>Superannuation</h2>
          <div class="form-grid">
            ${field({ name: 'fundName', label: 'Fund name', value: ob.super.fundName })}
            ${field({ name: 'memberNumber', label: 'Member number', value: ob.super.memberNumber })}
            ${field({ name: 'usi', label: 'USI', value: ob.super.usi, hint: 'Unique Superannuation Identifier' })}
          </div>
          <div class="form-actions"><button type="submit" class="btn btn-sm btn-primary">Save super details</button></div>
        </form>

        <form class="card" id="induction-form">
          <h2>Inductions</h2>
          <table class="table compact"><thead><tr><th>Induction</th><th>Completed on</th></tr></thead><tbody>
            ${D.INDUCTIONS.map((t) => html`<tr>
              <td><label for="ind-${LHS.ui.slug(t)}">${t}</label>${D.MANDATORY_INDUCTIONS.includes(t) ? html` <span class="badge">Mandatory</span>` : ''}</td>
              <td><input type="date" id="ind-${LHS.ui.slug(t)}" name="${t}" value="${(inductionsByType[t] || {}).completedDate || ''}"></td></tr>`)}
          </tbody></table>
          <div class="form-actions"><button type="submit" class="btn btn-sm btn-primary">Save inductions</button></div>
        </form>
      </div>

      <section class="card">
        <h2>Contractor agreement</h2>
        <p>Status: <span class="badge ${agreement.status === 'Signed' ? 'badge-ok' : agreement.status === 'Not generated' ? '' : 'badge-warn'}">${agreement.status}</span>
          ${agreement.generatedAt ? html`<span class="muted small"> · generated ${fmtDate(agreement.generatedAt)}</span>` : ''}
          ${agreement.sentAt ? html`<span class="muted small"> · sent ${fmtDate(agreement.sentAt)}</span>` : ''}
          ${agreement.signedAt ? html`<span class="muted small"> · signed ${fmtDate(agreement.signedAt)}</span>` : ''}</p>
        <div class="actions">
          <button type="button" class="btn btn-sm" data-action="generateAgreement">${agreement.status === 'Not generated' ? 'Generate agreement' : 'Regenerate / print'}</button>
          ${agreement.status === 'Draft' ? html`<button type="button" class="btn btn-sm" data-action="sendAgreement">Mark sent for e-signature</button>` : ''}
          ${agreement.status === 'Sent for signature' ? html`<button type="button" class="btn btn-sm btn-primary" data-action="signAgreement">Record signed</button>` : ''}
        </div>
        <p class="muted small">Opens a printable agreement you can save as PDF. Sending through an e-signature platform (DocuSign or Adobe Sign) isn't connected yet.</p>
      </section>`.s;

    LHS.tabs.onAction(el, {
      editBank: () => {
        if (!LHS.store.apiMode && !D.cryptoAvailable()) { toast('Encryption is unavailable in this browser context; bank details cannot be stored.', 'error'); return; }
        dialog({
          title: 'Bank details',
          body: html`<div class="form-grid">
            ${field({ name: 'accountName', label: 'Account name', required: true, full: true, attrs: 'autocomplete="off"' })}
            ${field({ name: 'bsb', label: 'BSB', required: true, placeholder: '000-000', attrs: 'pattern="\\d{3}-?\\d{3}" inputmode="numeric" autocomplete="off"' })}
            ${field({ name: 'account', label: 'Account number', required: true, attrs: 'pattern="\\d{5,10}" inputmode="numeric" autocomplete="off"' })}
          </div>`,
          submitLabel: 'Encrypt & save',
          onSubmit: async (v) => {
            await LHS.store.saveBank(c.id, { accountName: v.accountName, bsb: v.bsb, account: v.account });
            toast('Bank details encrypted and saved', 'success');
            refresh();
          },
        });
      },
      revealBank: async () => {
        try {
          const b = await LHS.store.revealBank(c.id);
          el.querySelector('#bank-display').textContent = `${b.accountName} · BSB ${b.bsb.slice(0, 3)}-${b.bsb.slice(3)} · Acct ${b.account}`;
        } catch (e) {
          toast(LHS.store.apiMode ? `Could not reveal bank details: ${e.message}` : 'Could not decrypt. The encryption key isn\'t available in this browser.', 'error');
        }
      },
      generateAgreement: () => {
        const w = window.open('', '_blank');
        if (!w) { toast('Pop-up blocked. Allow pop-ups to open the agreement.', 'error'); return; }
        w.document.write(agreementHtml(c));
        w.document.close();
        if (agreement.status === 'Not generated') update((x) => { x.onboarding.agreement = { status: 'Draft', generatedAt: todayISO() }; }, 'Generated contractor agreement');
        else LHS.store.audit('Regenerated contractor agreement', c.id);
      },
      sendAgreement: () => update((x) => { Object.assign(x.onboarding.agreement, { status: 'Sent for signature', sentAt: todayISO() }); }, 'Sent contractor agreement for signature'),
      signAgreement: () => confirmDialog('Record signed agreement', 'Confirm you have received the signed agreement. A document record is added automatically.', 'Record signed', () =>
        update((x) => {
          Object.assign(x.onboarding.agreement, { status: 'Signed', signedAt: todayISO() });
          x.documents.push({ id: uid(), type: 'Contractor agreement', name: 'Signed contractor agreement', fileName: '', uploadedAt: new Date().toISOString(), expiry: '', uploadedBy: LHS.store.session().userName });
        }, 'Contractor agreement signed')),
    });

    el.querySelector('#super-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = LHS.util.formData(e.target);
      update((x) => { x.onboarding.super = v; }, 'Updated super details', v.fundName);
      toast('Super details saved', 'success');
    });

    el.querySelector('#induction-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = LHS.util.formData(e.target);
      update((x) => {
        x.inductions = D.INDUCTIONS.filter((t) => v[t]).map((t) => ({ id: (inductionsByType[t] || {}).id || uid(), type: t, completedDate: v[t], notes: '' }));
      }, 'Updated inductions', D.INDUCTIONS.filter((t) => v[t]).join(', ') || 'none');
      toast('Inductions saved', 'success');
    });
  };
})(window.LHS);
