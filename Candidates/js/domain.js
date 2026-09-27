/* Candidate domain rules: reference data, status workflow, validation, expiry, dedup, encryption. */
window.LHS = window.LHS || {};

(function (LHS) {
  'use strict';
  const { daysUntil, fullName } = LHS.util;

  // ---- Reference data (req 3.1.1 – 3.1.3) ----
  const STATUSES = ['Prospect', 'Screening', 'Cleared', 'Submitted', 'Shortlisted', 'Placed', 'Active', 'Bench', 'Inactive', 'Do Not Use'];
  const CLEARANCE_LEVELS = ['None', 'Baseline', 'NV1', 'NV2', 'PV'];
  const CLEARANCE_VERIFICATION = ['Unverified', 'Pending', 'Verified', 'Failed'];
  const SOURCES = ['LinkedIn', 'Referral', 'Inbound', 'Job board', 'Partner agency'];
  const WORK_RIGHTS = ['Australian citizen', 'Permanent resident', 'NZ citizen', 'Visa holder'];
  const OUTREACH = ['Not contacted', 'InMail sent', 'Responded', 'Interested', 'Not interested'];
  const CONSENT_METHODS = ['Email', 'Written form', 'Verbal (recorded)', 'Candidate portal'];
  const CHECK_STATUSES = ['Not started', 'Requested', 'Cleared', 'Adverse', 'Not applicable'];
  const REFERENCE_STATUSES = ['Requested', 'Received', 'Declined', 'Unreachable'];
  const SCREENING_OUTCOMES = ['Pass', 'Hold', 'Fail'];
  const INDUCTIONS = ['WHS', 'Client site', 'ICT security'];
  const MANDATORY_INDUCTIONS = ['WHS', 'ICT security'];
  const AGREEMENT_STATUSES = ['Not generated', 'Draft', 'Sent for signature', 'Signed'];
  const DOCUMENT_TYPES = [
    'Resume', 'TFN declaration', 'Super choice form', 'Identity document', 'Qualification',
    'Visa', 'Security clearance', 'Certification', 'Police check', 'WWVP check', 'First aid',
    'Contractor agreement', 'Other',
  ];
  // Onboarding documents that must be on file before a candidate can go Active (req 3.1.3).
  const ONBOARDING_DOCS = ['TFN declaration', 'Super choice form', 'Identity document', 'Qualification'];

  // ---- Status workflow (req 3.1.5) ----
  // Forward path follows the requirement; Bench re-enters the pipeline; Inactive / Do Not Use are reachable from anywhere.
  const TRANSITIONS = {
    'Prospect': ['Screening'],
    'Screening': ['Cleared', 'Prospect'],
    'Cleared': ['Submitted', 'Bench'],
    'Submitted': ['Shortlisted', 'Cleared', 'Bench'],
    'Shortlisted': ['Placed', 'Cleared', 'Bench'],
    'Placed': ['Active', 'Bench'],
    'Active': ['Bench'],
    'Bench': ['Submitted', 'Screening'],
    'Inactive': ['Prospect'],
    'Do Not Use': [],
  };

  function allowedTransitions(c) {
    const next = [...(TRANSITIONS[c.status] || [])];
    ['Inactive', 'Do Not Use'].forEach((s) => {
      if (c.status !== s && c.status !== 'Do Not Use' && !next.includes(s)) next.push(s);
    });
    return next;
  }

  const hasDoc = (c, type) => (c.documents || []).some((d) => d.type === type && !isExpired(d.expiry));
  const isExpired = (iso) => iso && daysUntil(iso) < 0;

  function rightToWorkIssues(c) {
    const v = c.visa || {};
    if (!v.workRights) return ['Right-to-work status not recorded'];
    if (v.workRights === 'Visa holder') {
      const issues = [];
      if (!v.type) issues.push('Visa type not recorded');
      if (!v.expiry) issues.push('Visa expiry not recorded');
      else if (isExpired(v.expiry)) issues.push('Visa has expired');
      return issues;
    }
    return [];
  }

  // Returns a list of blocking reasons; empty means the move is allowed.
  function transitionBlockers(c, to) {
    if (!allowedTransitions(c).includes(to)) return [`Cannot move from ${c.status} to ${to}`];
    return gateIssues(c, to);
  }

  // Compliance gates for entering a status, independent of where the candidate is now.
  function gateIssues(c, to) {
    const blockers = [];
    if (to === 'Inactive' || to === 'Do Not Use' || to === 'Bench' || to === 'Prospect') return blockers;

    if (!c.consent || !c.consent.given) blockers.push('Privacy consent has not been recorded');

    if (['Cleared', 'Submitted', 'Shortlisted', 'Placed', 'Active'].includes(to)) {
      blockers.push(...rightToWorkIssues(c));
      if (!(c.screenings || []).some((s) => s.outcome === 'Pass')) blockers.push('No passed screening on record');
      if (!(c.references || []).some((r) => r.status === 'Received')) blockers.push('At least one reference must be received');
      const cl = c.clearance || {};
      if (cl.level && cl.level !== 'None') {
        if (cl.verification !== 'Verified') blockers.push(`${cl.level} clearance is not verified`);
        if (isExpired(cl.expiry)) blockers.push('Security clearance has expired');
      }
      if (c.checks && c.checks.police && c.checks.police.status === 'Adverse') blockers.push('Police check returned an adverse result');
    }

    if (to === 'Active') {
      const ob = c.onboarding || {};
      ONBOARDING_DOCS.forEach((t) => { if (!hasDoc(c, t)) blockers.push(`Missing onboarding document: ${t}`); });
      if (!ob.bank || !ob.bank.cipher) blockers.push('Bank details not recorded');
      if (!ob.super || !ob.super.fundName) blockers.push('Superannuation fund details not recorded');
      MANDATORY_INDUCTIONS.forEach((i) => {
        if (!(c.inductions || []).some((x) => x.type === i && x.completedDate)) blockers.push(`${i} induction not completed`);
      });
      if (!ob.agreement || ob.agreement.status !== 'Signed') blockers.push('Contractor agreement not signed');
      if (c.abn && !validABN(c.abn)) blockers.push('ABN is invalid');
    }
    return blockers;
  }

  // ---- ABN checksum (req 2.10) ----
  function validABN(abn) {
    const digits = String(abn || '').replace(/\s/g, '');
    if (!/^\d{11}$/.test(digits)) return false;
    const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
    const nums = digits.split('').map(Number);
    nums[0] -= 1;
    return nums.reduce((sum, n, i) => sum + n * weights[i], 0) % 89 === 0;
  }

  const formatABN = (abn) => {
    const d = String(abn || '').replace(/\s/g, '');
    return d.length === 11 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : abn;
  };

  // ---- Expiry tracking (req 3.1.3 / 3.9.2) ----
  function expiryItems(c) {
    const items = [];
    const push = (label, date, kind) => { if (date) items.push({ label, date, kind, days: daysUntil(date) }); };
    const v = c.visa || {};
    if (v.workRights === 'Visa holder') push(`Visa${v.type ? ' (' + v.type + ')' : ''}`, v.expiry, 'Visa');
    const cl = c.clearance || {};
    if (cl.level && cl.level !== 'None') push(`${cl.level} clearance`, cl.expiry, 'Clearance');
    (c.certifications || []).forEach((x) => push(`Certification: ${x.name}`, x.expiry, 'Certification'));
    const ch = c.checks || {};
    if (ch.police) push('Police check', ch.police.expiry, 'Police check');
    if (ch.wwvp && ch.wwvp.applicable) push('WWVP check', ch.wwvp.expiry, 'WWVP');
    (c.documents || []).forEach((d) => push(`Document: ${d.type} – ${d.name}`, d.expiry, 'Document'));
    return items.sort((a, b) => a.days - b.days);
  }

  // Buckets align with the 30/60/90-day alert cadence used across the system.
  function expiryBucket(days) {
    if (days === null || days === undefined) return null;
    if (days < 0) return 'expired';
    if (days <= 30) return '30';
    if (days <= 60) return '60';
    if (days <= 90) return '90';
    return 'ok';
  }

  // ---- Privacy: 7-year retention after last activity (req 3.10.2) ----
  const RETENTION_YEARS = 7;
  function retentionDue(c) {
    const last = new Date(c.updatedAt || c.createdAt);
    const due = new Date(last);
    due.setFullYear(due.getFullYear() + RETENTION_YEARS);
    return due <= new Date();
  }

  // ---- Deduplication (req 3.1.1) ----
  const normEmail = (e) => (e || '').trim().toLowerCase();
  const normPhone = (p) => { const d = (p || '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : ''; };
  const normUrl = (u) => (u || '').trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '');
  const normName = (c) => fullName(c).toLowerCase().replace(/\s+/g, ' ').trim();

  function matchReasons(a, b) {
    const reasons = [];
    if (normEmail(a.email) && normEmail(a.email) === normEmail(b.email)) reasons.push('Same email');
    if (normPhone(a.phone) && normPhone(a.phone) === normPhone(b.phone)) reasons.push('Same phone');
    const la = normUrl(a.linkedin && a.linkedin.url), lb = normUrl(b.linkedin && b.linkedin.url);
    if (la && la === lb) reasons.push('Same LinkedIn profile');
    if (normName(a) !== '(no name)' && normName(a) === normName(b)) reasons.push('Same name');
    return reasons;
  }

  // A name match alone is too weak; require a contact/profile match or name plus employer/location.
  function isLikelyDuplicate(a, b) {
    const r = matchReasons(a, b);
    if (r.some((x) => x !== 'Same name')) return r;
    if (r.includes('Same name')) {
      const same = (x, y) => x && y && x.trim().toLowerCase() === y.trim().toLowerCase();
      if (same(a.currentEmployer, b.currentEmployer)) return [...r, 'Same employer'];
      if (same(a.location, b.location)) return [...r, 'Same location'];
    }
    return [];
  }

  function findDuplicatesOf(candidate, all) {
    return all
      .filter((o) => o.id !== candidate.id && !o.erased)
      .map((o) => ({ candidate: o, reasons: isLikelyDuplicate(candidate, o) }))
      .filter((m) => m.reasons.length);
  }

  function findDuplicatePairs(all) {
    const live = all.filter((c) => !c.erased);
    const pairs = [];
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const reasons = isLikelyDuplicate(live[i], live[j]);
        if (reasons.length) pairs.push({ a: live[i], b: live[j], reasons });
      }
    }
    return pairs;
  }

  // Primary wins on conflicts; blanks are filled from the secondary; lists are unioned.
  function mergeCandidates(primary, secondary) {
    const m = JSON.parse(JSON.stringify(primary));
    const fillBlanks = (target, source) => {
      Object.keys(source || {}).forEach((k) => {
        const tv = target[k], sv = source[k];
        if (Array.isArray(sv)) return;
        if (sv && typeof sv === 'object') { target[k] = target[k] || {}; fillBlanks(target[k], sv); }
        else if ((tv === undefined || tv === null || tv === '') && sv !== undefined) target[k] = sv;
      });
    };
    fillBlanks(m, secondary);

    const union = (key, keyFn) => {
      const seen = new Set((m[key] || []).map(keyFn));
      m[key] = [...(m[key] || [])];
      (secondary[key] || []).forEach((x) => { if (!seen.has(keyFn(x))) { seen.add(keyFn(x)); m[key].push(x); } });
    };
    union('skills', (s) => s.name.toLowerCase());
    union('certifications', (x) => (x.name + '|' + (x.expiry || '')).toLowerCase());
    ['screenings', 'references', 'documents', 'inductions', 'statusHistory', 'outreachLog'].forEach((k) => union(k, (x) => x.id || JSON.stringify(x)));
    if (secondary.notes) m.notes = [m.notes, `[Merged from duplicate] ${secondary.notes}`].filter(Boolean).join('\n\n');
    m.mergedFrom = [...(m.mergedFrom || []), secondary.id];
    return m;
  }

  // ---- Skills assessment scoring (req 3.1.2) ----
  // Each required skill has a weight (1–3) and a rating (0–5); score is a weighted percentage.
  function assessmentScore(ratings) {
    const list = (ratings || []).filter((r) => r.weight > 0);
    const max = list.reduce((s, r) => s + r.weight * 5, 0);
    if (!max) return null;
    return Math.round((list.reduce((s, r) => s + r.weight * (Number(r.rating) || 0), 0) / max) * 100);
  }

  // ---- Encryption of bank details (req 3.1.3 / 3.10.2) ----
  // AES-256-GCM via Web Crypto. The key lives in this browser only; production must use server-side KMS.
  const KEY_STORE = 'lhs.candidates.key';
  let keyPromise = null;
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  const cryptoAvailable = () => !!(window.crypto && crypto.subtle);

  function getKey() {
    if (keyPromise) return keyPromise;
    keyPromise = (async () => {
      const stored = localStorage.getItem(KEY_STORE);
      if (stored) return crypto.subtle.importKey('jwk', JSON.parse(stored), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
      localStorage.setItem(KEY_STORE, JSON.stringify(await crypto.subtle.exportKey('jwk', key)));
      return key;
    })();
    return keyPromise;
  }

  async function encrypt(obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(JSON.stringify(obj));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await getKey(), data);
    return { iv: b64(iv), cipher: b64(ct) };
  }

  async function decrypt(payload) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(payload.iv) }, await getKey(), unb64(payload.cipher));
    return JSON.parse(new TextDecoder().decode(pt));
  }

  // ---- Candidate factory ----
  function blankCandidate() {
    return {
      id: LHS.util.uid(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      status: 'Prospect',
      firstName: '', lastName: '', email: '', phone: '', location: '', currentEmployer: '', currentTitle: '',
      abn: '', availabilityDate: '', salary: { basis: 'Daily rate', amount: '' },
      skills: [], certifications: [],
      clearance: { level: 'None', expiry: '', issuingAgency: '', verification: 'Unverified' },
      visa: { workRights: '', type: '', expiry: '', restrictions: '' },
      source: { channel: '', detail: '' },
      linkedin: { url: '', outreachStatus: 'Not contacted' },
      outreachLog: [],
      consent: { given: false, date: '', method: '', collectionNoticeProvided: false },
      screenings: [], references: [],
      checks: { police: { status: 'Not started', date: '', expiry: '' }, wwvp: { applicable: false, status: 'Not started', number: '', expiry: '' } },
      documents: [], inductions: [],
      onboarding: { bank: null, super: { fundName: '', memberNumber: '', usi: '' }, agreement: { status: 'Not generated' } },
      statusHistory: [], notes: '',
    };
  }

  LHS.domain = {
    STATUSES, CLEARANCE_LEVELS, CLEARANCE_VERIFICATION, SOURCES, WORK_RIGHTS, OUTREACH, CONSENT_METHODS,
    CHECK_STATUSES, REFERENCE_STATUSES, SCREENING_OUTCOMES, INDUCTIONS, MANDATORY_INDUCTIONS, AGREEMENT_STATUSES,
    DOCUMENT_TYPES, ONBOARDING_DOCS, RETENTION_YEARS,
    allowedTransitions, transitionBlockers, gateIssues, rightToWorkIssues, hasDoc,
    validABN, formatABN, expiryItems, expiryBucket, retentionDue,
    findDuplicatesOf, findDuplicatePairs, mergeCandidates, assessmentScore,
    cryptoAvailable, encrypt, decrypt, blankCandidate,
  };
})(window.LHS);
