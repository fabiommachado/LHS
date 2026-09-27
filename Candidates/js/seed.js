/* Demo data for offline mode (index.html opened from disk). The API mode uses the database's demo data instead. */
window.LHS = window.LHS || {};

(function (LHS) {
  'use strict';
  const { uid, addDaysISO } = LHS.util;

  LHS.seed = function seed() {
    const d = LHS.domain;
    const mk = (over) => {
      const c = Object.assign(d.blankCandidate(), over);
      c.statusHistory = c.statusHistory.length ? c.statusHistory : [{ id: uid(), from: null, to: c.status, at: c.createdAt, by: 'Seed data', reason: 'Initial import' }];
      return c;
    };
    const q1 = {
      id: uid(), roleType: 'Cloud Engineer',
      questions: ['Describe your most recent AWS or Azure migration.', 'What infrastructure-as-code tools have you used in production?', 'Are you comfortable working on-site in Canberra 3 days a week?'],
      requiredSkills: [{ name: 'AWS', weight: 3 }, { name: 'Terraform', weight: 2 }, { name: 'Kubernetes', weight: 2 }, { name: 'Python', weight: 1 }],
    };
    const q2 = {
      id: uid(), roleType: 'Business Analyst',
      questions: ['Walk through a requirements elicitation you led in government.', 'Which modelling notations (BPMN, UML) do you use?', 'Experience with Digital Service Standard?'],
      requiredSkills: [{ name: 'Requirements analysis', weight: 3 }, { name: 'BPMN', weight: 2 }, { name: 'Stakeholder engagement', weight: 3 }],
    };
    const now = new Date().toISOString();
    const ref = (name, company, status) => ({ id: uid(), name, company, relationship: 'Former manager', email: '', phone: '', status, requestedDate: addDaysISO(-20), response: status === 'Received' ? 'Strong technical skills, reliable, would re-hire.' : '' });
    const doc = (type, name, expiry) => ({ id: uid(), type, name, fileName: name.toLowerCase().replace(/\s+/g, '-') + '.pdf', uploadedAt: now, expiry: expiry || '', uploadedBy: 'Seed data' });

    const candidates = [
      mk({
        firstName: 'Priya', lastName: 'Raman', email: 'priya.raman@example.com', phone: '0412 345 678', location: 'Canberra, ACT',
        currentEmployer: 'Department of Home Affairs', currentTitle: 'Senior Cloud Engineer', status: 'Active', abn: '51 824 753 556',
        availabilityDate: addDaysISO(120), salary: { basis: 'Daily rate', amount: '1150' },
        skills: [{ name: 'AWS', years: 8 }, { name: 'Terraform', years: 5 }, { name: 'Kubernetes', years: 4 }, { name: 'Python', years: 6 }],
        certifications: [{ id: uid(), name: 'AWS Solutions Architect – Professional', issuer: 'Amazon Web Services', expiry: addDaysISO(25) }],
        clearance: { level: 'NV1', expiry: addDaysISO(700), issuingAgency: 'AGSVA', verification: 'Verified' },
        visa: { workRights: 'Australian citizen', type: '', expiry: '', restrictions: '' },
        source: { channel: 'LinkedIn', detail: 'Recruiter search: AWS NV1 Canberra' },
        linkedin: { url: 'https://www.linkedin.com/in/priya-raman-example', outreachStatus: 'Interested' },
        consent: { given: true, date: addDaysISO(-200), method: 'Email', collectionNoticeProvided: true },
        screenings: [{ id: uid(), date: addDaysISO(-190), questionnaireId: q1.id, roleType: 'Cloud Engineer', answers: [], notes: 'Excellent depth on AWS landing zones.', outcome: 'Pass', ratings: [{ skill: 'AWS', weight: 3, rating: 5 }, { skill: 'Terraform', weight: 2, rating: 4 }, { skill: 'Kubernetes', weight: 2, rating: 4 }, { skill: 'Python', weight: 1, rating: 4 }] }],
        references: [ref('Tom Nguyen', 'Department of Finance', 'Received')],
        checks: { police: { status: 'Cleared', date: addDaysISO(-180), expiry: addDaysISO(185) }, wwvp: { applicable: false, status: 'Not applicable', number: '', expiry: '' } },
        documents: [doc('Resume', 'Priya Raman CV'), doc('TFN declaration', 'TFN declaration'), doc('Super choice form', 'Super choice'), doc('Identity document', 'Passport', addDaysISO(1500)), doc('Qualification', 'BEng Software'), doc('Contractor agreement', 'Signed contractor agreement')],
        inductions: [{ id: uid(), type: 'WHS', completedDate: addDaysISO(-170), notes: '' }, { id: uid(), type: 'ICT security', completedDate: addDaysISO(-170), notes: '' }],
        onboarding: { bank: null, super: { fundName: 'AustralianSuper', memberNumber: '12345678', usi: 'STA0100AU' }, agreement: { status: 'Signed', generatedAt: addDaysISO(-175), signedAt: addDaysISO(-172) } },
        notes: 'Placed with Home Affairs via Cloud Platform SOW.',
      }),
      mk({
        firstName: 'James', lastName: 'O\'Connell', email: 'j.oconnell@example.com', phone: '0423 111 222', location: 'Queanbeyan, NSW',
        currentEmployer: 'Accenture', currentTitle: 'Business Analyst', status: 'Screening',
        availabilityDate: addDaysISO(14), salary: { basis: 'Daily rate', amount: '950' },
        skills: [{ name: 'Requirements analysis', years: 7 }, { name: 'BPMN', years: 5 }, { name: 'Stakeholder engagement', years: 7 }, { name: 'Jira', years: 6 }],
        clearance: { level: 'Baseline', expiry: addDaysISO(50), issuingAgency: 'AGSVA', verification: 'Pending' },
        visa: { workRights: 'Australian citizen', type: '', expiry: '', restrictions: '' },
        source: { channel: 'Referral', detail: 'Referred by Priya Raman' },
        consent: { given: true, date: addDaysISO(-10), method: 'Email', collectionNoticeProvided: true },
        references: [ref('Sarah Lee', 'Accenture', 'Requested')],
      }),
      mk({
        firstName: 'Wei', lastName: 'Zhang', email: 'wei.zhang@example.com', phone: '0433 987 654', location: 'Canberra, ACT',
        currentEmployer: 'Datacom', currentTitle: 'DevOps Engineer', status: 'Bench', availabilityDate: addDaysISO(3),
        salary: { basis: 'Daily rate', amount: '1000' },
        skills: [{ name: 'Azure', years: 5 }, { name: 'Kubernetes', years: 4 }, { name: 'Terraform', years: 3 }, { name: 'Go', years: 2 }],
        clearance: { level: 'Baseline', expiry: addDaysISO(400), issuingAgency: 'AGSVA', verification: 'Verified' },
        visa: { workRights: 'Visa holder', type: 'Subclass 482', expiry: addDaysISO(45), restrictions: 'Must work in nominated occupation' },
        source: { channel: 'Job board', detail: 'SEEK' },
        consent: { given: true, date: addDaysISO(-400), method: 'Candidate portal', collectionNoticeProvided: true },
        screenings: [{ id: uid(), date: addDaysISO(-380), questionnaireId: q1.id, roleType: 'Cloud Engineer', answers: [], notes: 'Strong on Azure, lighter on AWS.', outcome: 'Pass', ratings: [{ skill: 'AWS', weight: 3, rating: 2 }, { skill: 'Terraform', weight: 2, rating: 4 }, { skill: 'Kubernetes', weight: 2, rating: 4 }, { skill: 'Python', weight: 1, rating: 3 }] }],
        references: [ref('Ana Costa', 'Datacom', 'Received')],
        documents: [doc('Visa', 'VEVO check', addDaysISO(45)), doc('Resume', 'Wei Zhang CV')],
      }),
      mk({
        firstName: 'Emma', lastName: 'Walsh', email: 'emma.walsh@example.com', phone: '0400 555 000', location: 'Canberra, ACT',
        currentEmployer: 'Services Australia', currentTitle: 'Test Analyst', status: 'Prospect', availabilityDate: addDaysISO(60),
        skills: [{ name: 'Selenium', years: 4 }, { name: 'Test automation', years: 5 }],
        source: { channel: 'LinkedIn', detail: 'InMail campaign – testers' },
        linkedin: { url: 'https://linkedin.com/in/emma-walsh-example', outreachStatus: 'InMail sent' },
      }),
      mk({
        firstName: 'Emma', lastName: 'Walsh', email: 'EMMA.WALSH@example.com', phone: '', location: 'Canberra ACT',
        currentEmployer: 'Services Australia', currentTitle: 'Senior Test Analyst', status: 'Prospect',
        skills: [{ name: 'Playwright', years: 2 }, { name: 'Test automation', years: 5 }],
        source: { channel: 'Partner agency', detail: 'Capital Talent Partners' },
        notes: 'Submitted by partner for testing roles.',
      }),
      mk({
        firstName: 'Daniel', lastName: 'Kovac', email: 'd.kovac@example.com', phone: '0455 202 303', location: 'Sydney, NSW',
        currentEmployer: '', currentTitle: 'Security Architect', status: 'Cleared', availabilityDate: addDaysISO(30),
        salary: { basis: 'Daily rate', amount: '1400' },
        skills: [{ name: 'ISM', years: 10 }, { name: 'IRAP', years: 6 }, { name: 'Zero trust', years: 4 }],
        certifications: [{ id: uid(), name: 'CISSP', issuer: 'ISC2', expiry: addDaysISO(-5) }],
        clearance: { level: 'NV2', expiry: addDaysISO(80), issuingAgency: 'AGSVA', verification: 'Verified' },
        visa: { workRights: 'Permanent resident', type: '', expiry: '', restrictions: '' },
        source: { channel: 'Inbound', detail: 'Website application' },
        consent: { given: true, date: addDaysISO(-60), method: 'Written form', collectionNoticeProvided: true },
        screenings: [{ id: uid(), date: addDaysISO(-50), roleType: 'Security Architect', questionnaireId: null, answers: [], notes: 'IRAP assessor background.', outcome: 'Pass', ratings: [] }],
        references: [ref('Mark Chen', 'CyberCX', 'Received')],
      }),
    ];
    return {
      candidates, questionnaires: [q1, q2],
      audit: [{ id: uid(), at: now, user: 'System', action: 'Seeded demo data', candidateId: null, details: `${candidates.length} candidates` }],
      session: { role: 'recruiter', userName: 'Recruitment Consultant', candidateId: null },
    };
  };
})(window.LHS);
