/*
  Data layer. Views read and write an in-memory state synchronously; persistence depends on how the page was opened:
    - API mode (served over http/https by the Candidates API): changes are sent to the API in order, in the background,
      and the server's response replaces the local copy. If the server rejects a change, the user is told and the
      candidate is reloaded from the server.
    - Offline mode (index.html opened from disk): everything is kept in this browser's localStorage, as a prototype.
*/
window.LHS = window.LHS || {};

(function (LHS) {
  'use strict';
  const { uid, fullName } = LHS.util;
  const STORAGE_KEY = 'lhs.candidates.v1';
  const SESSION_KEY = 'lhs.candidates.session';
  const API_BASE = window.LHS_API_BASE || '';
  const apiMode = !!window.LHS_API_BASE || /^https?:$/.test(location.protocol);

  let state = null;
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => fn());
  const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  // ======================= Session (simulated sign-in until Module 10) =======================

  function loadSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch (e) { return null; }
  }
  const defaultSession = () => ({ role: 'recruiter', userName: 'Recruitment Consultant', candidateId: null });
  const saveSession = () => localStorage.setItem(SESSION_KEY, JSON.stringify(state.session));

  function currentUserLabel() {
    const s = state.session;
    if (s.role === 'candidate') {
      const c = getCandidate(s.candidateId);
      return c ? `Candidate: ${fullName(c)}` : 'Candidate';
    }
    return s.userName;
  }

  // ======================= API transport =======================

  async function request(method, path, body) {
    const res = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-LHS-User': encodeURIComponent(currentUserLabel()) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const isJson = (res.headers.get('content-type') || '').includes('json');
    const data = res.status === 204 ? null : isJson ? await res.json() : null;
    if (!res.ok) {
      const err = new Error((data && (data.detail || data.title)) || `The server returned ${res.status}.`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // Writes run one at a time, in order, so the server sees changes in the sequence the user made them.
  const queue = [];
  let working = false;
  let lastError = null;
  const localRev = new Map();   // candidate id -> count of local edits, to avoid overwriting newer unsaved edits
  const bump = (id) => localRev.set(id, (localRev.get(id) || 0) + 1);

  function enqueue(op) {
    return new Promise((resolve, reject) => {
      queue.push({ ...op, resolve, reject });
      notify();
      pump();
    });
  }

  async function pump() {
    if (working) return;
    working = true;
    while (queue.length) {
      const op = queue.shift();
      try {
        const result = await run(op);
        lastError = null;
        op.resolve(result);
      } catch (err) {
        lastError = err;
        op.reject(err);
        if (!op.quiet) await recover(op, err);
      }
      notify();
    }
    working = false;
    notify();
  }

  // Replace the cached candidate with the server's copy unless the user has edited it again since this request was sent.
  function acceptServerCopy(doc, revAtSend) {
    const i = state.candidates.findIndex((c) => c.id === doc.id);
    if (i < 0) return;
    if ((localRev.get(doc.id) || 0) === revAtSend) state.candidates[i] = doc;
    else Object.assign(state.candidates[i], { version: doc.version, createdAt: doc.createdAt, statusHistory: doc.statusHistory });
  }

  async function run(op) {
    const rev = op.id ? localRev.get(op.id) || 0 : 0;
    switch (op.kind) {
      case 'save': {
        const c = getCandidate(op.id);
        if (!c) return null;
        const body = { candidate: c, audit: op.audit };
        const doc = c.version ? await request('PUT', `/candidates/${c.id}`, body) : await request('POST', '/candidates', body);
        acceptServerCopy(doc, rev);
        return doc;
      }
      case 'status': {
        const doc = await request('POST', `/candidates/${op.id}/status`, { to: op.to, reason: op.reason || null });
        acceptServerCopy(doc, rev);
        return doc;
      }
      case 'merge': {
        const doc = await request('POST', `/candidates/${op.id}/merge`, { secondaryId: op.secondaryId });
        acceptServerCopy(doc, rev);
        return doc;
      }
      case 'erase': return request('POST', `/candidates/${op.id}/erase`, { reason: op.reason });
      case 'bank': return request('PUT', `/candidates/${op.id}/bank`, op.details);
      case 'audit': return request('POST', '/audit', op.entry);
      case 'qsave': return request('PUT', `/questionnaires/${op.q.id}`, op.q);
      case 'qdelete': return request('DELETE', `/questionnaires/${op.id}`);
      default: throw new Error(`Unknown operation ${op.kind}`);
    }
  }

  // A rejected change: tell the user, drop queued changes for that record, and reload it from the server.
  async function recover(op, err) {
    LHS.ui.toast(`Not saved: ${err.message}`, 'error');
    const ids = [op.id, op.secondaryId].filter(Boolean);
    for (let i = queue.length - 1; i >= 0; i--) {
      if (ids.includes(queue[i].id)) queue.splice(i, 1)[0].reject(new Error('Cancelled after an earlier error'));
    }
    try {
      for (const id of ids) {
        const doc = await request('GET', `/candidates/${id}`).catch((e) => { if (e.status === 404) return null; throw e; });
        const i = state.candidates.findIndex((c) => c.id === id);
        if (doc && i >= 0) state.candidates[i] = doc;
        else if (doc) state.candidates.push(doc);
        else if (i >= 0) state.candidates.splice(i, 1);
        localRev.delete(id);
      }
      if (op.kind === 'qsave' || op.kind === 'qdelete') state.questionnaires = await request('GET', '/questionnaires');
    } catch (e) {
      console.error('Could not reload after a failed save', e);
    }
    LHS.app.render();
  }

  const syncState = () => ({ apiMode, pending: queue.length + (working ? 1 : 0), error: lastError });

  // ======================= Offline persistence =======================

  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ candidates: state.candidates, questionnaires: state.questionnaires, audit: state.audit }));
    } catch (e) {
      LHS.ui.toast('Could not save – browser storage is full or unavailable.', 'error');
      throw e;
    }
  }

  // ======================= Loading =======================

  async function load() {
    const session = loadSession() || defaultSession();
    if (apiMode) {
      state = { candidates: [], questionnaires: [], audit: [], session };
      const [candidates, questionnaires] = await Promise.all([request('GET', '/candidates'), request('GET', '/questionnaires')]);
      Object.assign(state, { candidates, questionnaires });
    } else {
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { console.error('Could not read saved data, starting fresh', e); }
      state = Object.assign(saved || LHS.seed(), { session: (saved && saved.session) || session });
      saveLocal();
    }
    saveSession();
    notify();
  }

  // ======================= Audit (req 3.10.2) =======================
  // In API mode the server writes audit entries for every change itself; only client-side events are posted here.

  function audit(action, candidateId, details) {
    if (apiMode) {
      enqueue({ kind: 'audit', quiet: true, entry: { action, candidateId: candidateId || null, details: details || null } }).catch(() => {});
      return;
    }
    state.audit.unshift({ id: uid(), at: new Date().toISOString(), user: currentUserLabel(), action, candidateId: candidateId || null, details: details || '' });
    if (state.audit.length > 5000) state.audit.length = 5000;
    saveLocal();
  }

  const auditLog = (candidateId) => (candidateId ? state.audit.filter((a) => a.candidateId === candidateId) : state.audit);

  // Always returns the latest entries: from the server in API mode (after pending writes), from memory offline.
  async function fetchAuditLog(candidateId) {
    if (!apiMode) return auditLog(candidateId);
    await waitForSync();
    const entries = await request('GET', `/audit${candidateId ? `?candidateId=${candidateId}` : ''}`);
    return entries;
  }

  function waitForSync() {
    return new Promise((resolve) => {
      if (!queue.length && !working) return resolve();
      const off = subscribe(() => { if (!queue.length && !working) { off(); resolve(); } });
    });
  }

  // ======================= Candidates =======================

  const listCandidates = () => state.candidates.filter((c) => !c.erased);
  const getCandidate = (id) => state.candidates.find((c) => c.id === id && !c.erased) || null;

  function saveCandidate(candidate, action, details) {
    candidate.updatedAt = new Date().toISOString();
    const i = state.candidates.findIndex((c) => c.id === candidate.id);
    if (i >= 0) state.candidates[i] = candidate;
    else state.candidates.push(candidate);
    const auditAction = action || (i >= 0 ? 'Updated candidate' : 'Created candidate');
    bump(candidate.id);
    if (apiMode) enqueue({ kind: 'save', id: candidate.id, audit: { action: auditAction, details: details || fullName(candidate) } }).catch(() => {});
    else audit(auditAction, candidate.id, details || fullName(candidate));
    notify();
    return candidate;
  }

  // Applies a mutation to a fresh copy so a failed edit never leaves half-written state.
  function updateCandidate(id, mutate, action, details) {
    const current = getCandidate(id);
    if (!current) throw new Error('Candidate not found');
    const copy = JSON.parse(JSON.stringify(current));
    mutate(copy);
    return saveCandidate(copy, action, details);
  }

  // The status move is shown immediately; the database re-checks the workflow rules and has the final say.
  function changeStatus(id, to, reason) {
    const c = getCandidate(id);
    if (!c) throw new Error('Candidate not found');
    c.statusHistory = [...c.statusHistory, { id: uid(), from: c.status, to, at: new Date().toISOString(), by: currentUserLabel(), reason: reason || '' }];
    c.status = to;
    c.updatedAt = new Date().toISOString();
    bump(id);
    if (apiMode) enqueue({ kind: 'status', id, to, reason }).catch(() => {});
    else audit('Status changed', id, `${to}${reason ? ' – ' + reason : ''}`);
    notify();
    return c;
  }

  // Right to erasure (req 2.10 / 3.10.2): strip all PII, keep an anonymous tombstone so the audit trail stays intact.
  function eraseCandidate(id, reason) {
    const i = state.candidates.findIndex((c) => c.id === id);
    if (i < 0) return;
    const name = fullName(state.candidates[i]);
    state.candidates[i] = { id, erased: true, erasedAt: new Date().toISOString(), erasureReason: reason };
    if (state.session.candidateId === id) { state.session.candidateId = null; saveSession(); }
    if (apiMode) {
      enqueue({ kind: 'erase', id, reason }).catch(() => {});
    } else {
      state.audit.forEach((a) => {
        if (a.candidateId === id) a.details = '[erased]';
        if (a.user === `Candidate: ${name}`) a.user = 'Candidate: [erased]';
      });
      audit('Erased candidate (Privacy Act request)', id, reason);
    }
    notify();
  }

  function mergeInto(primaryId, secondaryId) {
    const primary = getCandidate(primaryId), secondary = getCandidate(secondaryId);
    const merged = LHS.domain.mergeCandidates(primary, secondary);
    state.candidates = state.candidates.filter((c) => c.id !== secondaryId);
    const i = state.candidates.findIndex((c) => c.id === primaryId);
    state.candidates[i] = merged;
    bump(primaryId);
    if (apiMode) {
      enqueue({ kind: 'merge', id: primaryId, secondaryId }).catch(() => {});
    } else {
      state.audit.forEach((a) => { if (a.candidateId === secondaryId) a.candidateId = primaryId; });
      audit('Merged duplicate', primaryId, `${fullName(secondary)} merged into ${fullName(primary)}`);
    }
    notify();
  }

  // ======================= Bank details (req 3.1.3) =======================
  // API mode: encrypted and decrypted by the server (reveals are audited there). Offline: Web Crypto in this browser.

  async function saveBank(id, details) {
    if (apiMode) {
      const summary = await enqueue({ kind: 'bank', id, details, quiet: true });
      const c = getCandidate(id);
      if (c) c.onboarding.bank = summary;
      notify();
      return summary;
    }
    const enc = await LHS.domain.encrypt({ accountName: details.accountName, bsb: details.bsb.replace('-', ''), account: details.account });
    updateCandidate(id, (x) => { x.onboarding.bank = { ...enc, last4: details.account.slice(-4), updatedAt: new Date().toISOString() }; }, 'Updated bank details', 'Encrypted');
    return getCandidate(id).onboarding.bank;
  }

  async function revealBank(id) {
    if (apiMode) {
      await waitForSync();
      return request('GET', `/candidates/${id}/bank`);
    }
    const c = getCandidate(id);
    const details = await LHS.domain.decrypt(c.onboarding.bank);
    audit('Revealed bank details', id, fullName(c));
    return details;
  }

  // ======================= Screening questionnaires (req 3.1.2) =======================

  const listQuestionnaires = () => state.questionnaires;
  const getQuestionnaire = (id) => state.questionnaires.find((q) => q.id === id) || null;

  function saveQuestionnaire(q) {
    const i = state.questionnaires.findIndex((x) => x.id === q.id);
    if (i >= 0) state.questionnaires[i] = q; else state.questionnaires.push(q);
    if (apiMode) enqueue({ kind: 'qsave', q }).catch(() => {});
    else audit(i >= 0 ? 'Updated questionnaire' : 'Created questionnaire', null, q.roleType);
    notify();
  }

  function deleteQuestionnaire(id) {
    const q = getQuestionnaire(id);
    state.questionnaires = state.questionnaires.filter((x) => x.id !== id);
    if (apiMode) enqueue({ kind: 'qdelete', id }).catch(() => {});
    else audit('Deleted questionnaire', null, q ? q.roleType : id);
    notify();
  }

  // ======================= Session =======================

  const session = () => state.session;
  function setSession(patch) {
    Object.assign(state.session, patch);
    saveSession();
    audit('Switched user', state.session.candidateId, state.session.role === 'candidate' ? 'Candidate portal' : 'Recruiter workspace');
    notify();
  }

  // Offline mode only: the database has its own demo data (database/06_demo_data.sql).
  function resetDemoData() {
    if (apiMode) throw new Error('Demo data is managed in the database in connected mode.');
    localStorage.removeItem(STORAGE_KEY);
    state = Object.assign(LHS.seed(), { session: state.session });
    saveLocal();
    notify();
  }

  LHS.store = {
    apiMode, load, subscribe, syncState, waitForSync,
    audit, auditLog, fetchAuditLog,
    listCandidates, getCandidate, saveCandidate, updateCandidate, changeStatus, eraseCandidate, mergeInto,
    saveBank, revealBank,
    listQuestionnaires, getQuestionnaire, saveQuestionnaire, deleteQuestionnaire,
    session, setSession, resetDemoData,
  };
})(window.LHS);
