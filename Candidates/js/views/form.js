/* Create / edit candidate profile (req 3.1.1), including LinkedIn import mode and duplicate check. */
window.LHS = window.LHS || {};
LHS.views = LHS.views || {};

(function (LHS) {
  'use strict';
  const { html, fullName, parseSkills, skillsToText, todayISO } = LHS.util;
  const D = LHS.domain;
  const { field, toast, dialog } = LHS.ui;

  const SALARY_BASIS = ['Daily rate', 'Hourly rate', 'Annual salary'];

  // Placeholder for the LinkedIn Recruiter API (Module 4.3). Until OAuth credentials are configured,
  // profiles are imported by pasting the profile URL and key details.
  LHS.linkedin = {
    configured: false,
    search() { return Promise.reject(new Error('LinkedIn Recruiter API is not configured')); },
  };

  function applyForm(c, v) {
    Object.assign(c, {
      firstName: v.firstName, lastName: v.lastName, email: v.email, phone: v.phone, location: v.location,
      currentEmployer: v.currentEmployer, currentTitle: v.currentTitle, abn: v.abn.replace(/\s/g, ''),
      availabilityDate: v.availabilityDate, notes: v.notes,
    });
    c.salary = { basis: v.salaryBasis, amount: v.salaryAmount };
    c.skills = parseSkills(v.skills);
    c.clearance = { level: v.clLevel, expiry: v.clExpiry, issuingAgency: v.clAgency, verification: v.clVerification };
    c.visa = { workRights: v.workRights, type: v.visaType, expiry: v.visaExpiry, restrictions: v.visaRestrictions };
    c.source = { channel: v.sourceChannel, detail: v.sourceDetail };
    c.linkedin = { url: v.linkedinUrl, outreachStatus: v.outreachStatus };
    const consentChanged = v.consentGiven !== !!c.consent.given;
    c.consent = { given: v.consentGiven, date: v.consentGiven ? (v.consentDate || todayISO()) : '', method: v.consentGiven ? v.consentMethod : '', collectionNoticeProvided: v.collectionNotice };
    return consentChanged;
  }

  function validate(v) {
    const errors = [];
    if (!v.email && !v.phone && !v.linkedinUrl) errors.push('Provide at least one contact method: email, phone or LinkedIn URL.');
    if (v.abn && !D.validABN(v.abn)) errors.push('ABN fails the ATO checksum. Check the 11 digits.');
    if (v.workRights === 'Visa holder' && !v.visaExpiry) errors.push('Visa expiry is required for visa holders.');
    if (v.clLevel !== 'None' && !v.clExpiry) errors.push('Enter the clearance revalidation/expiry date.');
    if (v.consentGiven && !v.consentMethod) errors.push('Record how consent was obtained.');
    if (v.linkedinUrl && !/^https?:\/\/([a-z]+\.)?linkedin\.com\//i.test(v.linkedinUrl)) errors.push('LinkedIn URL should be a linkedin.com profile link.');
    return errors;
  }

  LHS.views.form = function (root, params) {
    const editing = params.id ? LHS.store.getCandidate(params.id) : null;
    if (params.id && !editing) { root.innerHTML = html`<h1 tabindex="-1">Candidate not found</h1>`.s; return 'Not found'; }
    const linkedinMode = !editing && params.source === 'LinkedIn';
    const c = editing ? JSON.parse(JSON.stringify(editing)) : D.blankCandidate();
    if (linkedinMode) c.source = { channel: 'LinkedIn', detail: '' };
    const title = editing ? `Edit ${fullName(editing)}` : linkedinMode ? 'Import candidate from LinkedIn' : 'New candidate';
    const cancelHref = editing ? `#/candidates/${editing.id}` : '#/candidates';

    root.innerHTML = html`
      <nav class="crumbs" aria-label="Breadcrumb"><a href="#/candidates">Candidates</a> › <span>${title}</span></nav>
      <div class="page-head"><h1 tabindex="-1">${title}</h1></div>
      ${linkedinMode ? html`<div class="callout">
        <strong>LinkedIn import.</strong> Paste the candidate's public profile URL and key details. The candidate is created as a
        <em>Prospect</em> with source <em>LinkedIn</em>, and outreach is tracked from here.
        ${LHS.linkedin.configured ? '' : html`<br><span class="muted small">Direct search and one-click import need LinkedIn Recruiter API (OAuth) credentials, which aren't configured yet.</span>`}
      </div>` : ''}
      <div id="form-errors" class="errors" role="alert" tabindex="-1" hidden></div>
      <form id="cand-form" class="stack" novalidate>
        ${linkedinMode ? html`<fieldset class="card"><legend>LinkedIn profile</legend><div class="form-grid">
          ${field({ name: 'linkedinUrl', label: 'LinkedIn profile URL', type: 'url', value: c.linkedin.url, required: true, placeholder: 'https://www.linkedin.com/in/…', full: true })}
        </div></fieldset>` : ''}

        <fieldset class="card"><legend>Personal &amp; contact details</legend><div class="form-grid">
          ${field({ name: 'firstName', label: 'First name', value: c.firstName, required: true, attrs: 'autocomplete="off"' })}
          ${field({ name: 'lastName', label: 'Last name', value: c.lastName, required: true, attrs: 'autocomplete="off"' })}
          ${field({ name: 'email', label: 'Email', type: 'email', value: c.email })}
          ${field({ name: 'phone', label: 'Phone', type: 'tel', value: c.phone })}
          ${field({ name: 'location', label: 'Location', value: c.location, placeholder: 'e.g. Canberra, ACT' })}
          ${field({ name: 'abn', label: 'ABN (if contracting via ABN)', value: c.abn ? D.formatABN(c.abn) : '', hint: 'Validated against the ATO checksum', attrs: 'inputmode="numeric"' })}
        </div></fieldset>

        <fieldset class="card"><legend>Employment, skills &amp; availability</legend><div class="form-grid">
          ${field({ name: 'currentTitle', label: 'Current title', value: c.currentTitle })}
          ${field({ name: 'currentEmployer', label: 'Current employer', value: c.currentEmployer })}
          ${field({ name: 'skills', label: 'Skills', type: 'textarea', value: skillsToText(c.skills), hint: 'Comma separated; add years in brackets, e.g. AWS (5), Terraform (3), Agile', full: true })}
          ${field({ name: 'availabilityDate', label: 'Availability date', type: 'date', value: c.availabilityDate })}
          ${field({ name: 'salaryBasis', label: 'Rate / salary basis', type: 'select', list: SALARY_BASIS, value: c.salary.basis })}
          ${field({ name: 'salaryAmount', label: 'Expectation (AUD, ex GST/super)', type: 'number', value: c.salary.amount, attrs: 'min="0" step="1"' })}
        </div>
        ${editing ? html`<p class="muted small">Certifications are managed on the candidate's Profile tab.</p>` : ''}
        </fieldset>

        <fieldset class="card"><legend>Security clearance</legend><div class="form-grid">
          ${field({ name: 'clLevel', label: 'Clearance level', type: 'select', list: D.CLEARANCE_LEVELS, value: c.clearance.level })}
          ${field({ name: 'clExpiry', label: 'Revalidation / expiry date', type: 'date', value: c.clearance.expiry })}
          ${field({ name: 'clAgency', label: 'Issuing agency', value: c.clearance.issuingAgency, placeholder: 'e.g. AGSVA' })}
          ${field({ name: 'clVerification', label: 'Verification status', type: 'select', list: D.CLEARANCE_VERIFICATION, value: c.clearance.verification })}
        </div></fieldset>

        <fieldset class="card"><legend>Right to work</legend><div class="form-grid">
          ${field({ name: 'workRights', label: 'Work rights', type: 'select', list: D.WORK_RIGHTS, value: c.visa.workRights, placeholder: 'Not yet checked' })}
          ${field({ name: 'visaType', label: 'Visa type / subclass', value: c.visa.type, placeholder: 'e.g. Subclass 482' })}
          ${field({ name: 'visaExpiry', label: 'Visa expiry', type: 'date', value: c.visa.expiry })}
          ${field({ name: 'visaRestrictions', label: 'Work restrictions', value: c.visa.restrictions, placeholder: 'e.g. 48 hrs/fortnight' })}
        </div></fieldset>

        <fieldset class="card"><legend>Sourcing</legend><div class="form-grid">
          ${field({ name: 'sourceChannel', label: 'How was this candidate found?', type: 'select', list: D.SOURCES, value: c.source.channel, placeholder: 'Select source', required: true })}
          ${field({ name: 'sourceDetail', label: 'Source detail', value: c.source.detail, placeholder: 'Referrer, job board, partner agency name…' })}
          ${linkedinMode ? '' : field({ name: 'linkedinUrl', label: 'LinkedIn profile URL', type: 'url', value: c.linkedin.url })}
          ${field({ name: 'outreachStatus', label: 'LinkedIn outreach status', type: 'select', list: D.OUTREACH, value: c.linkedin.outreachStatus })}
        </div></fieldset>

        <fieldset class="card"><legend>Privacy consent (Privacy Act 1988)</legend><div class="form-grid">
          ${field({ name: 'consentGiven', label: 'Candidate consents to the agency collecting, storing and using their personal information for recruitment', type: 'checkbox', value: c.consent.given, full: true })}
          ${field({ name: 'collectionNotice', label: 'Privacy collection notice provided to candidate', type: 'checkbox', value: c.consent.collectionNoticeProvided, full: true })}
          ${field({ name: 'consentDate', label: 'Consent date', type: 'date', value: c.consent.date })}
          ${field({ name: 'consentMethod', label: 'How consent was obtained', type: 'select', list: D.CONSENT_METHODS, value: c.consent.method, placeholder: 'Select method' })}
        </div>
        <p class="muted small">Candidates without recorded consent stay at <em>Prospect</em> and can't move further through the workflow.</p>
        </fieldset>

        <fieldset class="card"><legend>Internal notes</legend>
          ${field({ name: 'notes', label: 'Notes (not visible to the candidate)', type: 'textarea', value: c.notes, full: true })}
        </fieldset>

        <div class="form-actions">
          <a class="btn" href="${cancelHref}">Cancel</a>
          <button type="submit" class="btn btn-primary">${editing ? 'Save changes' : linkedinMode ? 'Import candidate' : 'Create candidate'}</button>
        </div>
      </form>`.s;

    const form = root.querySelector('#cand-form');
    const errorsEl = root.querySelector('#form-errors');

    const persist = (v) => {
      const consentChanged = applyForm(c, v);
      if (!editing) c.statusHistory = [{ id: LHS.util.uid(), from: null, to: 'Prospect', at: new Date().toISOString(), by: LHS.store.session().userName, reason: linkedinMode ? 'Imported from LinkedIn' : 'Created' }];
      LHS.store.saveCandidate(c, editing ? 'Updated profile' : linkedinMode ? 'Imported from LinkedIn' : 'Created candidate');
      if (consentChanged) LHS.store.audit(c.consent.given ? 'Consent recorded' : 'Consent withdrawn', c.id, c.consent.method || '');
      toast(editing ? 'Candidate updated' : 'Candidate created', 'success');
      location.hash = `#/candidates/${c.id}`;
    };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = LHS.util.formData(form);
      const errors = [];
      if (!form.checkValidity()) errors.push('Complete the required fields (marked *).');
      errors.push(...validate(v));
      if (errors.length) {
        errorsEl.hidden = false;
        errorsEl.innerHTML = html`<strong>Please fix the following:</strong><ul>${errors.map((x) => html`<li>${x}</li>`)}</ul>`.s;
        errorsEl.scrollIntoView({ block: 'center' });
        errorsEl.focus();
        return;
      }
      errorsEl.hidden = true;

      // Dedup check before saving (req 3.1.1 / conflict check 3.5.2).
      const probe = Object.assign(JSON.parse(JSON.stringify(c)), { firstName: v.firstName, lastName: v.lastName, email: v.email, phone: v.phone, location: v.location, currentEmployer: v.currentEmployer, linkedin: { url: v.linkedinUrl } });
      const dupes = D.findDuplicatesOf(probe, LHS.store.listCandidates());
      if (!dupes.length) return persist(v);
      dialog({
        title: 'Possible duplicate',
        body: html`<p>This candidate looks like an existing record:</p>
          <ul class="plain">${dupes.map((d) => html`<li><a href="#/candidates/${d.candidate.id}">${fullName(d.candidate)}</a> – ${d.candidate.status}
            <div class="muted small">${d.reasons.join(', ')}${d.candidate.source.channel ? ' · source: ' + d.candidate.source.channel : ''}</div></li>`)}</ul>
          <p class="muted small">Save anyway if this is a different person. Otherwise open the existing record. You can merge duplicates later from the Duplicates page.</p>`,
        submitLabel: 'Save anyway',
        onSubmit: () => persist(v),
      });
    });
    return title;
  };
})(window.LHS);
