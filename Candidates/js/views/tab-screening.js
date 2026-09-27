/* Screening tab: questionnaires & skills scoring, references, clearance/police/WWVP checks (req 3.1.2). */
window.LHS = window.LHS || {};
LHS.tabs = LHS.tabs || {};

(function (LHS) {
  'use strict';
  const { html, raw, uid, fmtDate, todayISO } = LHS.util;
  const D = LHS.domain;
  const { dialog, field, empty } = LHS.ui;

  const scoreBadge = (score) => (score === null || score === undefined ? html`<span class="muted">—</span>`
    : html`<span class="badge ${score >= 75 ? 'badge-ok' : score >= 50 ? 'badge-warn' : 'badge-bad'}">${score}%</span>`);

  const outcomeBadge = (o) => html`<span class="badge ${o === 'Pass' ? 'badge-ok' : o === 'Fail' ? 'badge-bad' : 'badge-warn'}">${o}</span>`;

  function questionnaireFields(q) {
    if (!q) return html`<p class="muted small">No questionnaire selected. Record free-form call notes below.</p>`;
    return html`
      <h3>Questions</h3>
      ${q.questions.map((text, i) => field({ name: `answer_${i}`, label: `${i + 1}. ${text}`, type: 'textarea', full: true }))}
      ${q.requiredSkills.length ? html`<h3>Skills assessment</h3>
        <p class="muted small">Rate 0 (none) to 5 (expert). Weight shows how important the skill is for this role type.</p>
        <table class="table compact"><thead><tr><th>Required skill</th><th class="num">Weight</th><th>Rating</th></tr></thead><tbody>
        ${q.requiredSkills.map((s, i) => html`<tr><td><label for="rate-${i}">${s.name}</label></td><td class="num">${s.weight}</td>
          <td><select id="rate-${i}" name="rating_${i}">${[0, 1, 2, 3, 4, 5].map((n) => html`<option value="${n}" ${n === 3 ? raw('selected') : ''}>${n}</option>`)}</select></td></tr>`)}
        </tbody></table>` : ''}`;
  }

  function screeningDialog(c, update) {
    const qs = LHS.store.listQuestionnaires();
    const dlg = dialog({
      title: 'Record screening call',
      wide: true,
      body: html`<div class="form-grid">
          <div class="field"><label for="scr-q">Questionnaire</label>
            <select id="scr-q" name="questionnaireId"><option value="">None</option>${qs.map((q) => html`<option value="${q.id}">${q.roleType}</option>`)}</select></div>
          ${field({ name: 'date', label: 'Call date', type: 'date', value: todayISO(), required: true })}
          ${field({ name: 'roleType', label: 'Role type', required: true })}
        </div>
        <div id="scr-dynamic">${questionnaireFields(null)}</div>
        <div class="form-grid">
          ${field({ name: 'notes', label: 'Call notes', type: 'textarea', full: true, required: true })}
          ${field({ name: 'outcome', label: 'Outcome', type: 'select', list: D.SCREENING_OUTCOMES, value: 'Hold', required: true })}
        </div>`,
      submitLabel: 'Save screening',
      onSubmit: (v) => {
        const q = LHS.store.getQuestionnaire(v.questionnaireId);
        const answers = q ? q.questions.map((question, i) => ({ question, answer: v[`answer_${i}`] || '' })) : [];
        const ratings = q ? q.requiredSkills.map((s, i) => ({ skill: s.name, weight: s.weight, rating: Number(v[`rating_${i}`]) })) : [];
        update((x) => x.screenings.push({ id: uid(), date: v.date, questionnaireId: q ? q.id : null, roleType: v.roleType, answers, ratings, notes: v.notes, outcome: v.outcome }),
          'Recorded screening', `${v.roleType}: ${v.outcome}`);
      },
    });
    const sel = dlg.querySelector('#scr-q');
    sel.addEventListener('change', () => {
      const q = LHS.store.getQuestionnaire(sel.value);
      dlg.querySelector('#scr-dynamic').innerHTML = questionnaireFields(q).s;
      if (q) dlg.querySelector('[name="roleType"]').value = q.roleType;
    });
  }

  function viewScreening(s) {
    const score = D.assessmentScore(s.ratings);
    dialog({
      title: `Screening – ${s.roleType}`,
      wide: true,
      body: html`<p>${fmtDate(s.date)} · ${outcomeBadge(s.outcome)} · Skills score ${scoreBadge(score)}</p>
        ${s.answers.length ? html`<h3>Answers</h3><dl class="qa">${s.answers.map((a) => html`<dt>${a.question}</dt><dd class="prewrap">${a.answer || '—'}</dd>`)}</dl>` : ''}
        ${s.ratings.length ? html`<h3>Skills assessment</h3><table class="table compact"><thead><tr><th>Skill</th><th class="num">Weight</th><th class="num">Rating</th></tr></thead>
          <tbody>${s.ratings.map((r) => html`<tr><td>${r.skill}</td><td class="num">${r.weight}</td><td class="num">${r.rating}/5</td></tr>`)}</tbody></table>` : ''}
        <h3>Call notes</h3><p class="prewrap">${s.notes}</p>`,
    });
  }

  function referenceDialog(c, update, existing) {
    const r = existing || { status: 'Requested', requestedDate: todayISO() };
    dialog({
      title: existing ? `Reference – ${existing.name}` : 'Request reference',
      body: html`<div class="form-grid">
        ${field({ name: 'name', label: 'Referee name', value: r.name, required: true })}
        ${field({ name: 'company', label: 'Organisation', value: r.company })}
        ${field({ name: 'relationship', label: 'Relationship', value: r.relationship, placeholder: 'e.g. Former manager' })}
        ${field({ name: 'email', label: 'Email', type: 'email', value: r.email })}
        ${field({ name: 'phone', label: 'Phone', type: 'tel', value: r.phone })}
        ${field({ name: 'requestedDate', label: 'Requested on', type: 'date', value: r.requestedDate })}
        ${field({ name: 'status', label: 'Status', type: 'select', list: D.REFERENCE_STATUSES, value: r.status })}
        ${field({ name: 'response', label: 'Reference response', type: 'textarea', value: r.response, full: true })}
      </div>`,
      submitLabel: existing ? 'Save' : 'Add reference',
      onSubmit: (v) => update((x) => {
        if (existing) Object.assign(x.references.find((y) => y.id === existing.id), v);
        else x.references.push({ id: uid(), ...v });
      }, existing ? 'Updated reference' : 'Requested reference', `${v.name}: ${v.status}`),
    });
  }

  LHS.tabs.screening = function (c, el, refresh) {
    const update = (...a) => LHS.tabs.update(c, refresh, ...a);
    const gate = D.gateIssues(c, 'Cleared');
    const ch = c.checks;

    el.innerHTML = html`
      <section class="card ${gate.length ? 'card-warn' : 'card-ok'}">
        <h2>Readiness for <em>Cleared</em></h2>
        ${gate.length ? html`<ul class="blockers">${gate.map((b) => html`<li>${b}</li>`)}</ul>` : html`<p>✓ All screening requirements are met.</p>`}
      </section>

      <section class="card">
        <div class="card-head"><h2>Screening calls</h2><button type="button" class="btn btn-sm btn-primary" data-action="addScreening">Record screening</button></div>
        ${c.screenings.length ? html`<table class="table"><thead><tr><th>Date</th><th>Role type</th><th>Skills score</th><th>Outcome</th><th>Notes</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>
          ${c.screenings.slice().reverse().map((s) => html`<tr>
            <td>${fmtDate(s.date)}</td><td>${s.roleType}</td><td>${scoreBadge(D.assessmentScore(s.ratings))}</td><td>${outcomeBadge(s.outcome)}</td>
            <td class="truncate">${s.notes}</td><td class="num"><button type="button" class="link-btn" data-action="viewScreening" data-id="${s.id}">View</button></td></tr>`)}
        </tbody></table>` : empty('No screening calls recorded.')}
      </section>

      <section class="card">
        <div class="card-head"><h2>References</h2><button type="button" class="btn btn-sm" data-action="addReference">Request reference</button></div>
        ${c.references.length ? html`<table class="table"><thead><tr><th>Referee</th><th>Organisation</th><th>Requested</th><th>Status</th><th>Response</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>
          ${c.references.map((r) => html`<tr>
            <td>${r.name}<div class="muted small">${r.relationship}</div></td><td>${r.company}</td><td>${fmtDate(r.requestedDate)}</td>
            <td><span class="badge ${r.status === 'Received' ? 'badge-ok' : r.status === 'Requested' ? 'badge-warn' : 'badge-bad'}">${r.status}</span></td>
            <td class="truncate">${r.response}</td>
            <td class="num"><button type="button" class="link-btn" data-action="editReference" data-id="${r.id}">Update</button></td></tr>`)}
        </tbody></table>` : empty('No references requested.')}
      </section>

      <form class="card" id="checks-form">
        <h2>Background checks</h2>
        <fieldset><legend>Security clearance verification</legend><div class="form-grid">
          <div class="field"><span class="label">Level</span><span>${c.clearance.level}</span></div>
          ${c.clearance.level !== 'None' ? html`
            ${field({ name: 'clVerification', label: 'Verification status', type: 'select', list: D.CLEARANCE_VERIFICATION, value: c.clearance.verification })}
            ${field({ name: 'clAgency', label: 'Issuing agency', value: c.clearance.issuingAgency })}
            ${field({ name: 'clExpiry', label: 'Expiry', type: 'date', value: c.clearance.expiry })}` : html`<p class="muted small">No clearance held. Set a level via <a href="#/candidates/${c.id}/edit">Edit profile</a>.</p>`}
        </div></fieldset>
        <fieldset><legend>National police check</legend><div class="form-grid">
          ${field({ name: 'policeStatus', label: 'Status', type: 'select', list: D.CHECK_STATUSES, value: ch.police.status })}
          ${field({ name: 'policeDate', label: 'Check date', type: 'date', value: ch.police.date })}
          ${field({ name: 'policeExpiry', label: 'Valid until', type: 'date', value: ch.police.expiry })}
        </div></fieldset>
        <fieldset><legend>Working With Vulnerable People (ACT)</legend><div class="form-grid">
          ${field({ name: 'wwvpApplicable', label: 'Required for this candidate\'s roles', type: 'checkbox', value: ch.wwvp.applicable, full: true })}
          ${field({ name: 'wwvpStatus', label: 'Status', type: 'select', list: D.CHECK_STATUSES, value: ch.wwvp.status })}
          ${field({ name: 'wwvpNumber', label: 'Registration number', value: ch.wwvp.number })}
          ${field({ name: 'wwvpExpiry', label: 'Expiry', type: 'date', value: ch.wwvp.expiry })}
        </div></fieldset>
        <div class="form-actions"><button type="submit" class="btn btn-primary">Save checks</button></div>
      </form>`.s;

    LHS.tabs.onAction(el, {
      addScreening: () => screeningDialog(c, update),
      viewScreening: (id) => viewScreening(c.screenings.find((s) => s.id === id)),
      addReference: () => referenceDialog(c, update),
      editReference: (id) => referenceDialog(c, update, c.references.find((r) => r.id === id)),
    });

    el.querySelector('#checks-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = LHS.util.formData(e.target);
      update((x) => {
        if (x.clearance.level !== 'None') Object.assign(x.clearance, { verification: v.clVerification, issuingAgency: v.clAgency, expiry: v.clExpiry });
        x.checks.police = { status: v.policeStatus, date: v.policeDate, expiry: v.policeExpiry };
        x.checks.wwvp = { applicable: v.wwvpApplicable, status: v.wwvpStatus, number: v.wwvpNumber, expiry: v.wwvpExpiry };
      }, 'Updated background checks', `Clearance: ${v.clVerification || 'n/a'}, Police: ${v.policeStatus}, WWVP: ${v.wwvpApplicable ? v.wwvpStatus : 'n/a'}`);
      LHS.ui.toast('Checks saved', 'success');
    });
  };
})(window.LHS);
