/* Documents tab: compliance document register with expiry tracking (req 3.1.3, 3.10.3). */
window.LHS = window.LHS || {};
LHS.tabs = LHS.tabs || {};

(function (LHS) {
  'use strict';
  const { html, uid, fmtDate } = LHS.util;
  const D = LHS.domain;
  const { expiryBadge, dialog, field, empty, confirmDialog } = LHS.ui;

  // Records document metadata. File contents need the central document store (Module 10.3), which doesn't exist yet.
  LHS.tabs.documentDialog = function (onSave, types) {
    dialog({
      title: 'Add document',
      body: html`<div class="form-grid">
        ${field({ name: 'type', label: 'Document type', type: 'select', list: types || D.DOCUMENT_TYPES, required: true, placeholder: 'Select type' })}
        ${field({ name: 'name', label: 'Description', required: true, placeholder: 'e.g. Passport, AWS certificate' })}
        <div class="field full"><label for="doc-file">File</label><input id="doc-file" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"></div>
        ${field({ name: 'expiry', label: 'Expiry date', type: 'date', hint: 'For visas, clearances, certifications, checks, first aid and similar' })}
      </div>
      <p class="muted small">Only the file name and details are saved for now. File contents will be stored once the document service is connected.</p>`,
      submitLabel: 'Add document',
      onSubmit: (v, form) => {
        const file = form.querySelector('#doc-file').files[0];
        onSave({ id: uid(), type: v.type, name: v.name, fileName: file ? file.name : '', size: file ? file.size : 0, expiry: v.expiry, uploadedAt: new Date().toISOString() });
      },
    });
  };

  LHS.tabs.documentsTable = (docs, removable) => (docs.length ? html`
    <table class="table"><thead><tr><th>Type</th><th>Description</th><th>File</th><th>Added</th><th>Expiry</th>${removable ? html`<th><span class="sr-only">Actions</span></th>` : ''}</tr></thead><tbody>
      ${docs.map((d) => html`<tr>
        <td>${d.type}</td><td>${d.name}</td><td class="small">${d.fileName || html`<span class="muted">—</span>`}</td>
        <td class="small">${fmtDate(d.uploadedAt)}${d.uploadedBy ? html`<div class="muted">${d.uploadedBy}</div>` : ''}</td>
        <td>${expiryBadge(d.expiry)}</td>
        ${removable ? html`<td class="num"><button type="button" class="link-btn danger" data-action="removeDoc" data-id="${d.id}">Remove</button></td>` : ''}
      </tr>`)}
    </tbody></table>` : empty('No documents on file.'));

  LHS.tabs.documents = function (c, el, refresh) {
    const update = (...a) => LHS.tabs.update(c, refresh, ...a);
    const docs = c.documents.slice().sort((a, b) => a.type.localeCompare(b.type));
    const upcoming = D.expiryItems(c).filter((i) => ['expired', '30', '60', '90'].includes(D.expiryBucket(i.days)));

    el.innerHTML = html`
      ${upcoming.length ? html`<section class="card card-warn"><h2>Expiring within 90 days</h2>
        <ul class="plain">${upcoming.map((i) => html`<li>${i.label} – ${expiryBadge(i.date)}</li>`)}</ul></section>` : ''}
      <section class="card">
        <div class="card-head"><h2>Documents</h2><button type="button" class="btn btn-sm btn-primary" data-action="addDoc">Add document</button></div>
        ${LHS.tabs.documentsTable(docs, true)}
      </section>`.s;

    LHS.tabs.onAction(el, {
      addDoc: () => LHS.tabs.documentDialog((doc) => update((x) => x.documents.push({ ...doc, uploadedBy: LHS.store.session().userName }), 'Added document', `${doc.type}: ${doc.name}`)),
      removeDoc: (id) => {
        const doc = c.documents.find((d) => d.id === id);
        confirmDialog('Remove document', `Remove "${doc.name}" (${doc.type})?`, 'Remove', () =>
          update((x) => { x.documents = x.documents.filter((d) => d.id !== id); }, 'Removed document', `${doc.type}: ${doc.name}`), true);
      },
    });
  };
})(window.LHS);
