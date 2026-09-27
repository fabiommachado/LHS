/* Candidate self-service portal (req 3.1.4). Candidates see only their own record and never internal notes or screening detail. */
window.LHS = window.LHS || {};
LHS.views = LHS.views || {};

(function (LHS) {
  'use strict';
  const { html, fullName, parseSkills, skillsToText, todayISO } = LHS.util;
  const D = LHS.domain;
  const { field, toast, confirmDialog, empty } = LHS.ui;

  // Candidate-facing wording; internal states such as "Do Not Use" are never shown.
  const FRIENDLY = {
    'Prospect': 'Profile received', 'Screening': 'Application in review', 'Cleared': 'Ready for opportunities',
    'Submitted': 'Submitted to a client', 'Shortlisted': 'Shortlisted by a client', 'Placed': 'Placement confirmed',
    'Active': 'On assignment', 'Bench': 'Available for new opportunities', 'Inactive': 'Not currently active', 'Do Not Use': 'Not currently active',
  };

  // Documents a candidate may upload themselves.
  const SELF_SERVICE_DOCS = ['Resume', 'TFN declaration', 'Super choice form', 'Identity document', 'Qualification', 'Visa', 'Certification', 'Police check', 'WWVP check', 'First aid', 'Other'];

  function signIn(root) {
    const list = LHS.store.listCandidates().filter((c) => c.status !== 'Do Not Use');
    root.innerHTML = html`
      <div class="page-head"><h1 tabindex="-1">Candidate portal</h1></div>
      <section class="card narrow">
        <h2>Sign in</h2>
        <p class="muted small">Demo only: choose a candidate to see the portal as they would. Real sign-in with MFA/SSO comes with Module 10.</p>
        <form id="portal-signin" class="form-grid">
          <div class="field full"><label for="as">Candidate</label>
            <select id="as" name="candidateId" required><option value="">Select…</option>${list.map((c) => html`<option value="${c.id}">${fullName(c)}</option>`)}</select></div>
          <div class="form-actions full"><button class="btn btn-primary" type="submit">Sign in</button></div>
        </form>
      </section>`.s;
    root.querySelector('#portal-signin').addEventListener('submit', (e) => {
      e.preventDefault();
      const id = e.target.candidateId.value;
      if (!id) return;
      LHS.store.setSession({ role: 'candidate', candidateId: id });
      LHS.app.render();
    });
    return 'Candidate portal';
  }

  LHS.views.portal = function (root) {
    const session = LHS.store.session();
    const c = session.role === 'candidate' ? LHS.store.getCandidate(session.candidateId) : null;
    if (!c) return signIn(root);
    const refresh = () => LHS.app.render();
    const update = (mutate, action, details) => { LHS.store.updateCandidate(c.id, mutate, action, details); refresh(); };
    const missing = D.ONBOARDING_DOCS.filter((t) => !D.hasDoc(c, t));
    const myDocs = c.documents.slice().sort((a, b) => a.type.localeCompare(b.type));

    root.innerHTML = html`
      <div class="page-head">
        <div><h1 tabindex="-1">Welcome, ${c.firstName}</h1><p class="muted">Your candidate profile with the agency.</p></div>
      </div>

      <section class="kpis">
        <div class="kpi"><span class="kpi-l">Your status</span><span class="kpi-n kpi-text">${FRIENDLY[c.status]}</span></div>
        <div class="kpi ${missing.length ? 'kpi-warn' : ''}"><span class="kpi-l">Documents outstanding</span><span class="kpi-n">${missing.length}</span></div>
      </section>

      <div class="grid-2">
        <form class="card" id="portal-profile">
          <h2>My details</h2>
          <div class="form-grid">
            ${field({ name: 'email', label: 'Email', type: 'email', value: c.email, required: true })}
            ${field({ name: 'phone', label: 'Phone', type: 'tel', value: c.phone })}
            ${field({ name: 'location', label: 'Location', value: c.location })}
            ${field({ name: 'availabilityDate', label: 'Available from', type: 'date', value: c.availabilityDate })}
            ${field({ name: 'currentTitle', label: 'Current title', value: c.currentTitle })}
            ${field({ name: 'currentEmployer', label: 'Current employer', value: c.currentEmployer })}
            ${field({ name: 'skills', label: 'Skills', type: 'textarea', value: skillsToText(c.skills), full: true, hint: 'Comma separated, years in brackets, e.g. AWS (5)' })}
          </div>
          <div class="form-actions"><button type="submit" class="btn btn-primary">Save my details</button></div>
        </form>

        <section class="card">
          <h2>Documents</h2>
          ${missing.length ? html`<p>Please upload:</p><ul class="checklist">${missing.map((t) => html`<li class="missing">✗ ${t}</li>`)}</ul>` : html`<p>✓ All onboarding documents received.</p>`}
          ${myDocs.length ? LHS.tabs.documentsTable(myDocs, false) : empty('No documents uploaded yet.')}
          <button type="button" class="btn btn-sm btn-primary" data-action="upload">Upload document</button>
        </section>

        <section class="card">
          <h2>Privacy</h2>
          <p class="small">${c.consent.given ? `You consented to us holding your information on ${LHS.util.fmtDate(c.consent.date)}.` : 'You have not yet given consent for us to hold your information.'}</p>
          ${c.consent.given
            ? html`<button type="button" class="btn btn-sm" data-action="withdraw">Withdraw consent</button>`
            : html`<button type="button" class="btn btn-sm btn-primary" data-action="consent">I consent</button>`}
          <p class="muted small">To request a copy of your data or ask us to delete it, contact your consultant.</p>
        </section>

        <section class="card">
          <h2>Timesheets &amp; payslips</h2>
          <p class="muted small">Timesheet submission and payslips will be here once the Timesheet &amp; Payroll module is live.</p>
        </section>
      </div>`.s;

    root.querySelector('#portal-profile').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!e.target.checkValidity()) { e.target.reportValidity(); return; }
      const v = LHS.util.formData(e.target);
      update((x) => Object.assign(x, { ...v, skills: parseSkills(v.skills) }), 'Candidate updated own profile (portal)');
      toast('Your details have been saved', 'success');
    });

    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      if (b.dataset.action === 'upload') {
        LHS.tabs.documentDialog((doc) => update((x) => x.documents.push({ ...doc, uploadedBy: 'Candidate (portal)' }), 'Candidate uploaded document (portal)', `${doc.type}: ${doc.name}`), SELF_SERVICE_DOCS);
      }
      if (b.dataset.action === 'consent') {
        update((x) => { x.consent = { given: true, date: todayISO(), method: 'Candidate portal', collectionNoticeProvided: true }; }, 'Consent recorded', 'Candidate portal');
      }
      if (b.dataset.action === 'withdraw') {
        confirmDialog('Withdraw consent', 'If you withdraw consent, we can no longer put you forward for roles. Continue?', 'Withdraw', () =>
          update((x) => { x.consent = { ...x.consent, given: false }; }, 'Consent withdrawn', 'Candidate portal'), true);
      }
    });
    return 'My profile';
  };
})(window.LHS);
