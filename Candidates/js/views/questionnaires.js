/* Screening questionnaire builder per role type (req 3.1.2). */
window.LHS = window.LHS || {};
LHS.views = LHS.views || {};

(function (LHS) {
  'use strict';
  const { html, uid } = LHS.util;
  const { dialog, field, empty, confirmDialog, toast } = LHS.ui;

  // "Terraform: 2" per line -> [{name, weight}]; weight defaults to 1 and is clamped to 1–3.
  const parseRequiredSkills = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name, w] = l.split(':').map((s) => s.trim());
    return { name, weight: Math.min(3, Math.max(1, Number(w) || 1)) };
  });

  function editDialog(existing, refresh) {
    const q = existing || { roleType: '', questions: [], requiredSkills: [] };
    dialog({
      title: existing ? `Edit questionnaire – ${q.roleType}` : 'New questionnaire',
      wide: true,
      body: html`<div class="form-grid">
        ${field({ name: 'roleType', label: 'Role type', value: q.roleType, required: true, full: true, placeholder: 'e.g. Cloud Engineer' })}
        ${field({ name: 'questions', label: 'Screening questions', type: 'textarea', value: q.questions.join('\n'), required: true, full: true, hint: 'One question per line', attrs: 'rows="6"' })}
        ${field({ name: 'requiredSkills', label: 'Required skills and weights', type: 'textarea', value: q.requiredSkills.map((s) => `${s.name}: ${s.weight}`).join('\n'), full: true, hint: 'One per line as "Skill: weight". Weight 1 = nice to have, 3 = essential', attrs: 'rows="5"' })}
      </div>`,
      submitLabel: 'Save questionnaire',
      onSubmit: (v) => {
        LHS.store.saveQuestionnaire({
          id: q.id || uid(), roleType: v.roleType,
          questions: v.questions.split('\n').map((s) => s.trim()).filter(Boolean),
          requiredSkills: parseRequiredSkills(v.requiredSkills),
        });
        toast('Questionnaire saved', 'success');
        refresh();
      },
    });
  }

  LHS.views.questionnaires = function (root) {
    const refresh = () => LHS.app.render();
    const list = LHS.store.listQuestionnaires();
    root.innerHTML = html`
      <div class="page-head">
        <h1 tabindex="-1">Screening questionnaires</h1>
        <div class="actions"><button type="button" class="btn btn-primary" data-action="new">New questionnaire</button></div>
      </div>
      <p class="muted">Each role type has its own questions and weighted required skills. Recruiters use them when recording a screening call.</p>
      <div class="grid-2">
        ${list.length ? list.map((q) => html`<section class="card">
          <div class="card-head"><h2>${q.roleType}</h2>
            <div><button type="button" class="link-btn" data-action="edit" data-id="${q.id}">Edit</button> ·
            <button type="button" class="link-btn danger" data-action="delete" data-id="${q.id}">Delete</button></div></div>
          <ol class="small">${q.questions.map((x) => html`<li>${x}</li>`)}</ol>
          ${q.requiredSkills.length ? html`<div class="chips">${q.requiredSkills.map((s) => html`<span class="chip">${s.name} <span class="muted">×${s.weight}</span></span>`)}</div>` : ''}
        </section>`) : empty('No questionnaires yet.')}
      </div>`.s;

    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      const q = LHS.store.getQuestionnaire(b.dataset.id);
      if (b.dataset.action === 'new') editDialog(null, refresh);
      if (b.dataset.action === 'edit') editDialog(q, refresh);
      if (b.dataset.action === 'delete') confirmDialog('Delete questionnaire', `Delete the "${q.roleType}" questionnaire? Past screenings keep their answers.`, 'Delete', () => { LHS.store.deleteQuestionnaire(q.id); refresh(); }, true);
    });
    return 'Questionnaires';
  };
})(window.LHS);
