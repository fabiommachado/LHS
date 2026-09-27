/* Reusable UI pieces: toasts, dialogs, badges and form field builders. */
window.LHS = window.LHS || {};

(function (LHS) {
  'use strict';
  const { html, raw, fmtDate } = LHS.util;

  function toast(message, kind) {
    const region = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = `toast toast-${kind || 'info'}`;
    el.textContent = message;
    region.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }

  // Opens a native <dialog>. `body` is html``; `onSubmit(data, form)` returning false keeps it open.
  function dialog({ title, body, submitLabel, danger, onSubmit, wide }) {
    const dlg = document.createElement('dialog');
    dlg.className = 'modal' + (wide ? ' modal-wide' : '');
    dlg.setAttribute('aria-labelledby', 'dlg-title');
    dlg.innerHTML = html`
      <form method="dialog" class="modal-form" novalidate>
        <header class="modal-head">
          <h2 id="dlg-title">${title}</h2>
          <button type="button" class="icon-btn" data-close aria-label="Close">×</button>
        </header>
        <div class="modal-body">${body}</div>
        <footer class="modal-foot">
          <button type="button" class="btn" data-close>Cancel</button>
          ${submitLabel ? html`<button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${submitLabel}</button>` : ''}
        </footer>
      </form>`.s;
    document.body.appendChild(dlg);
    const form = dlg.querySelector('form');
    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
    dlg.addEventListener('close', () => dlg.remove());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      try {
        const keepOpen = onSubmit ? (await onSubmit(LHS.util.formData(form), form)) === false : false;
        if (!keepOpen) dlg.close();
      } catch (err) {
        console.error(err);
        toast(err.message || 'Something went wrong', 'error');
      }
    });
    dlg.showModal();
    const first = dlg.querySelector('.modal-body input, .modal-body select, .modal-body textarea');
    if (first) first.focus();
    return dlg;
  }

  const confirmDialog = (title, message, confirmLabel, onConfirm, danger) =>
    dialog({ title, body: html`<p>${message}</p>`, submitLabel: confirmLabel, danger, onSubmit: onConfirm });

  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const statusBadge = (status) => html`<span class="badge status-${slug(status)}">${status}</span>`;

  function expiryBadge(iso) {
    if (!iso) return html`<span class="muted">—</span>`;
    const days = LHS.util.daysUntil(iso);
    const bucket = LHS.domain.expiryBucket(days);
    const label = days < 0 ? `Expired ${-days}d ago` : days === 0 ? 'Expires today' : `${days}d`;
    return html`<span class="badge expiry-${bucket}" title="${fmtDate(iso)}">${fmtDate(iso)} · ${label}</span>`;
  }

  const options = (list, selected, placeholder) => html`
    ${placeholder !== undefined ? html`<option value="">${placeholder}</option>` : ''}
    ${list.map((o) => html`<option value="${o}" ${o === selected ? raw('selected') : ''}>${o}</option>`)}`;

  // Generic labelled field. `type` may be text/email/tel/date/number/textarea/select/checkbox.
  function field({ name, label, value, type, required, list, placeholder, hint, attrs, full }) {
    const id = 'f-' + slug(name) + '-' + Math.random().toString(36).slice(2, 7);
    const req = required ? raw(' required aria-required="true"') : '';
    const extra = raw(attrs || '');
    const hintEl = hint ? html`<small class="hint" id="${id}-hint">${hint}</small>` : '';
    const described = hint ? raw(` aria-describedby="${id}-hint"`) : '';
    let control;
    if (type === 'textarea') control = html`<textarea id="${id}" name="${name}" rows="3"${req}${described} ${extra}>${value || ''}</textarea>`;
    else if (type === 'select') control = html`<select id="${id}" name="${name}"${req}${described} ${extra}>${options(list, value, placeholder)}</select>`;
    else if (type === 'checkbox') {
      return html`<div class="field field-check ${full ? 'full' : ''}"><input type="checkbox" id="${id}" name="${name}" ${value ? raw('checked') : ''}${described} ${extra}><label for="${id}">${label}</label>${hintEl}</div>`;
    } else control = html`<input id="${id}" name="${name}" type="${type || 'text'}" value="${value ?? ''}" placeholder="${placeholder || ''}"${req}${described} ${extra}>`;
    return html`<div class="field ${full ? 'full' : ''}"><label for="${id}">${label}${required ? html`<span class="req" aria-hidden="true"> *</span>` : ''}</label>${control}${hintEl}</div>`;
  }

  const empty = (message) => html`<div class="empty">${message}</div>`;

  LHS.ui = { toast, dialog, confirmDialog, statusBadge, expiryBadge, options, field, empty, slug };
})(window.LHS);
