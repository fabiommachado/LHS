/* Shared helpers: safe HTML templating, ids, dates, form parsing. */
window.LHS = window.LHS || {};

(function (LHS) {
  'use strict';

  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

  // Marker for pre-rendered HTML that must not be escaped again.
  class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
  const raw = (s) => new Raw(s);

  function renderValue(v) {
    if (v instanceof Raw) return v.s;
    if (Array.isArray(v)) return v.map(renderValue).join('');
    if (v === null || v === undefined || v === false) return '';
    return esc(v);
  }

  // Tagged template: every interpolated value is HTML-escaped unless wrapped in raw()/html``.
  function html(strings, ...values) {
    let out = '';
    strings.forEach((str, i) => {
      out += str;
      if (i < values.length) out += renderValue(values[i]);
    });
    return raw(out);
  }

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  const DAY_MS = 24 * 60 * 60 * 1000;

  function todayISO() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function addDaysISO(days, from) {
    const base = from ? new Date(from + 'T00:00:00') : new Date(todayISO() + 'T00:00:00');
    base.setDate(base.getDate() + days);
    return new Date(base.getTime() - base.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  // Whole days from today until an ISO date (negative when in the past).
  function daysUntil(iso) {
    if (!iso) return null;
    const target = new Date(iso.slice(0, 10) + 'T00:00:00');
    const today = new Date(todayISO() + 'T00:00:00');
    return Math.round((target - today) / DAY_MS);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function fmtMoney(n) {
    if (n === null || n === undefined || n === '') return '—';
    return Number(n).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
  }

  // Reads a <form> into a plain object; checkboxes become booleans.
  function formData(form) {
    const out = {};
    Array.from(form.elements).forEach((el) => {
      if (!el.name || el.disabled) return;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value.trim();
    });
    return out;
  }

  // "Java (5), AWS, Kubernetes (2)" -> [{name, years}]
  function parseSkills(text) {
    return (text || '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
      const m = s.match(/^(.*?)\s*\((\d+(?:\.\d+)?)\)\s*$/);
      return m ? { name: m[1].trim(), years: Number(m[2]) } : { name: s, years: null };
    });
  }

  const skillsToText = (skills) =>
    (skills || []).map((s) => (s.years ? `${s.name} (${s.years})` : s.name)).join(', ');

  const fullName = (c) => [c.firstName, c.lastName].filter(Boolean).join(' ') || '(no name)';

  // Only http(s) links may be rendered as hrefs (blocks javascript: and data: URLs).
  const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');

  const debounce = (fn, ms) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  LHS.util = {
    esc, raw, html, uid, todayISO, addDaysISO, daysUntil, fmtDate, fmtDateTime, fmtMoney,
    formData, parseSkills, skillsToText, fullName, safeUrl, debounce,
  };
})(window.LHS);
