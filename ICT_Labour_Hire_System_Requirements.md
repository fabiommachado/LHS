# ICT Labour Hire Recruitment System — Business Requirements
## Canberra / ACT Focus | Version 1.0

---

## 1. Business Context

The system supports a Canberra-based ICT labour hire agency that:
- Provides contractors to Commonwealth and ACT Government agencies and private companies
- Operates under standard Australian labour hire licensing obligations
- Manages complex tax obligations including payroll tax, GST, FBT, and company tax
- Carries mandatory insurances and manages contractor compliance
- Partners with other recruitment agencies to share candidates and split margins
- Integrates with BuyICT for government ICT procurement opportunities
- Integrates with LinkedIn for candidate sourcing
- Integrates with Xero for all accounting functions

---

## 2. Regulatory, Licensing and Compliance Requirements

### 2.1 Labour Hire Licensing (ACT)
- The system must store and track the agency's ACT Labour Hire Licence (mandatory under the *Labour Hire Licensing Act 2020* (ACT)).
- Alerts must be triggered 90, 60, and 30 days before licence expiry.
- The system must record renewal applications, licence numbers, and associated documents.
- The system must support compliance reporting to the ACT Labour Hire Licensing Authority.

### 2.2 Payroll Tax (ACT)
- ACT payroll tax rate: 6.85% on wages above the threshold (~$2M annually).
- The system must:
  - Accumulate gross contractor wages (on-hire charges) monthly.
  - Calculate payroll tax liabilities and produce monthly/annual returns.
  - Track the wage threshold and alert when the agency approaches the taxable threshold.
  - Support grouping of associated entities for payroll tax purposes.
  - Integrate with Xero to post payroll tax liabilities as a bill/payable.

### 2.3 Goods and Services Tax (GST)
- All invoices to clients must include GST (10%).
- Contractor payments (if the contractor is a company/sole trader with an ABN) must be treated correctly under GST rules.
- The system must:
  - Generate GST-compliant tax invoices.
  - Track input tax credits (ITCs) on purchases.
  - Produce BAS-ready data for integration with Xero.

### 2.4 Fringe Benefits Tax (FBT)
- FBT applies if the agency provides non-cash benefits to employees or contractors treated as employees (e.g., novated leases, laptops, vehicles).
- The system must:
  - Record any benefits provided per employee/contractor.
  - Calculate FBT liability (Type 1 and Type 2 gross-up rates).
  - Produce annual FBT return data.
  - Support exempt benefit tracking (e.g., work-related portable electronic devices).

### 2.5 Company Income Tax
- Track deductible expenses (recruitment costs, insurance premiums, office overheads).
- Produce a profit and loss view by financial year suitable for tax return preparation.
- Integrate with Xero chart of accounts.

### 2.6 Workers Compensation Insurance
- The system must record the agency's workers compensation policy details (insurer, policy number, expiry, premium amount).
- Contractor placement records must indicate whether workers comp coverage is confirmed.
- Alerts triggered 90/60/30 days before policy expiry.
- Support for both employees of the agency and on-hire workers.

### 2.7 Public Liability Insurance
- Store policy details, coverage limits, and expiry.
- Minimum recommended coverage: $20M for government contracts.
- Alerts triggered 90/60/30 days before expiry.

### 2.8 Professional Indemnity Insurance
- Mandatory for ICT professional services.
- Store policy details, coverage amount, and expiry.
- Link PI insurance evidence to specific client contracts where required.

### 2.9 Cyber Liability Insurance
- Increasingly required for government ICT contracts.
- Store policy details and link to contracts with specific cyber insurance requirements.

### 2.10 Other Compliance
- ABN validation for all contractors and agency partners.
- PAYG Withholding obligations for employees.
- Contractor vs employee (sham contracting) risk assessment workflow.
- Modern Slavery Act compliance questionnaire for large clients.
- Privacy Act (Cth) compliance for candidate PII: data retention, access controls, deletion requests.
- ATO TPAR (Taxable Payments Annual Report) reporting for contractor payments.

---

## 3. System Modules

---

## Module 1: Candidate Lifecycle Management

### 3.1.1 Candidate Prospecting
- Capture candidate profiles including: name, contact details, current employer, clearance level (Baseline, NV1, NV2, PV), skills, certifications, visa status, availability date, location, and salary expectations.
- LinkedIn integration: search LinkedIn for candidates matching a skills/role profile; import candidate details into the system with one click; track LinkedIn outreach status.
- Candidate sourcing attribution: track how each candidate was found (LinkedIn, referral, inbound, job board, partner agency).
- Candidate deduplication: detect and merge duplicate profiles.
- GDPR/Privacy Act consent capture: record candidate consent to store and use their data.

### 3.1.2 Candidate Screening
- Structured screening questionnaire builder per role type.
- Record screening call notes and outcomes.
- Skills assessment scoring: rate candidate against required skills for a placement.
- Reference check workflow: request, track, and store reference responses.
- Right-to-work check: visa type, visa expiry, work restriction flags.
- Security clearance verification: clearance level, expiry date, issuing agency, verification status.
- Police check and Working With Vulnerable People check (where applicable).

### 3.1.3 Candidate Onboarding (Pre-Placement)
- Collect and store compliance documents: tax file number declaration, super choice form, bank details (encrypted), identity documents, qualifications.
- Generate and send contractor agreement (HTML/PDF) for e-signature.
- Track document expiry: visas, clearances, certifications, first aid, etc.
- Induction module: record completion of mandatory inductions (WHS, client site, ICT security).
- Superannuation fund details: fund name, member number, USI.

### 3.1.4 Candidate Portal (Self-Service)
- Candidates can log in to: update their profile, upload documents, submit timesheets, view payslips (if employed by agency), and check placement status.

### 3.1.5 Candidate Status Workflow
States: `Prospect → Screening → Cleared → Submitted → Shortlisted → Placed → Active → Bench → Inactive → Do Not Use`

---

## Module 2: Customer (Client) Relationship Management

### 3.2.1 Client Prospecting
- Record potential client organisations: name, ABN, agency type (Commonwealth, ACT Government, private), contact names and roles, source of lead.
- Track engagement history: calls, meetings, emails, proposals sent.
- Identify engagement panel membership: which procurement panels the client uses (e.g., ICTPA, Digital Marketplace, agency-specific panels).
- Integration with BuyICT: pull open opportunities and match to prospective clients.

### 3.2.2 Client Onboarding
- Capture: legal entity name, ABN, billing address, payment terms, preferred invoicing method, PO number requirements.
- Record client's procurement panel preferences and approved supplier status.
- Capture client-specific insurance requirements (minimum coverage levels).
- Credit check workflow and credit limit setting.
- Record client representatives and their authority levels (e.g., who can sign contracts, who approves timesheets).

### 3.2.3 Client Communication
- Email integration: log sent/received emails against client record.
- Meeting notes: record meeting date, attendees, discussion points, and action items.
- Opportunity pipeline: track active bids per client with probability weighting.
- Automated follow-up reminders.

---

## Module 3: Contract Management

### 3.3.1 Client Contracts
- Contract types: Master Services Agreement (MSA), Statement of Work (SOW), Work Order, Panel Agreement.
- Store: contract start/end dates, extension options, maximum value, approved roles, bill rates per role, payment terms.
- Support for government panel contracts (ICTPA, BuyICT Digital Marketplace, agency-specific panels).
- Rate card management: maintain standard rate cards per role/level/clearance.
- Contract extension workflow: alert 90/60/30 days before expiry; initiate extension or new SOW.
- Document storage: attach signed contracts, SOWs, POs.
- Contract value tracking: track spend against contract ceiling.

### 3.3.2 Contractor Placement Agreements
- Generate contractor placement letter/assignment schedule for each placement.
- Record: placement start date, end date, client, role title, classification, bill rate, pay rate, margin, location (on-site/remote), hours per week.
- Track placement extensions and replacements.
- Link placement to client contract and candidate record.

### 3.3.3 Contractor Replacement Workflow
- Alert when a placement is nearing end date (30/14/7 days).
- "Replace contractor" workflow: identify bench candidates matching the same skills profile; submit to client; track approval; transition placement from outgoing to incoming contractor.
- Overlap period tracking: if the agency funds a handover period, track associated cost.
- Client notification templates for contractor transitions.

### 3.3.4 Contract Finalisation
- Generate contract close-out checklist: final timesheet approved, final invoice raised, equipment returned, access revoked confirmation received, reference letter generated.
- Archive contract and all associated documents.
- Update contractor status to "Bench" or "Inactive".
- Trigger candidate re-engagement workflow if the contractor is to remain in the agency's pool.

---

## Module 4: Opportunity Management & Job Board

### 3.4.1 Internal Job Board
- Create and manage open positions (internal roles and client briefs).
- Each job: title, classification level (APS1–SES/EL2 equivalent), required skills, clearance level required, start date, duration, location, rate range, client (can be anonymous).
- Candidate matching engine: rank bench candidates against job requirements using skills weighting.
- One-click submission of a candidate to a job.
- Submission tracking: date submitted, client response, outcome.

### 3.4.2 BuyICT Integration
- Connect to the BuyICT Digital Marketplace API (or scrape where API not available) to retrieve open ICT procurement opportunities.
- Parse opportunity details: title, agency, category, open date, close date, estimated value, location, required capabilities.
- Map BuyICT categories to internal role types.
- Flag opportunities the agency is eligible to bid on (based on panel membership).
- Notify relevant account managers of new matching opportunities.
- Link BuyICT opportunities to internal pipeline records; track bid/no-bid decision and outcome.

### 3.4.3 LinkedIn Integration
- OAuth integration with LinkedIn Recruiter or LinkedIn Jobs API.
- Search LinkedIn for candidates by: skills, job title, location, current employer, open to work status.
- Import candidate profiles to the system.
- Track InMail outreach: sent date, response, outcome.
- Post job advertisements directly to LinkedIn from the system.
- LinkedIn company page integration: post updates and track engagement.

---

## Module 5: Partner Agency Management

### 3.5.1 Partner Agency Profiles
- Record partner agency details: name, ABN, contact persons, specialisations, geographical coverage, their labour hire licence number.
- Partner agreement storage: commission split percentage, payment terms, candidate ownership rules, conflict of interest provisions.
- Partner status: `Prospect → Active → Suspended → Inactive`.

### 3.5.2 Candidate Sharing
- Partner can submit candidates to the system for specific open roles.
- Each shared candidate is tagged with the originating partner agency.
- Candidate data access is restricted: partner can only see their own submitted candidates; internal candidates are not visible to partners.
- Conflict check: alert if a candidate submitted by a partner is already in the system from a different source.

### 3.5.3 Margin Splitting
- For each placement involving a partner agency candidate:
  - Record: total bill rate to client, pay rate to contractor, gross margin, partner's agreed split percentage.
  - Auto-calculate: agency's net margin after partner share.
  - Generate partner invoice (or approve partner's submitted invoice) for the agreed split amount.
- Partner payment schedule: track invoices raised to partners, approval status, and payment.
- Margin split reporting: per partner, per period, per placement.
- Xero integration: post partner commission payables to Xero.

---

## Module 6: Timesheet & Payroll

### 3.6.1 Timesheet Management
- Contractors submit weekly/fortnightly timesheets via the candidate portal or mobile app.
- Timesheet workflow: `Draft → Submitted → Client Approved → Agency Approved → Processed`.
- Client approver portal: client representatives log in to approve contractor timesheets.
- Automated reminders to contractors and clients for outstanding timesheets.
- Support for standard hours, overtime, allowances, and public holidays.
- Timesheet disputes: record dispute, resolution, and corrected timesheet.

### 3.6.2 Payroll Processing
- Calculate contractor pay from approved timesheets.
- Pay types: PAYG employee (agency employed), ABN contractor invoices, payroll-only contractors.
- Tax calculation for PAYG employees (using ATO tax tables, including HELP debt, SFSS, Medicare).
- Superannuation calculation and tracking (11.5% from FY25).
- Generate payslips for PAYG employees.
- Payment file export (ABA file) for bank upload.
- Integration with Xero payroll module for PAYG employees.
- PAYG withholding remittance scheduling.

---

## Module 7: Invoicing & Accounts Receivable

### 3.7.1 Invoice Generation
- Auto-generate client invoices from approved timesheets.
- Invoice line items: contractor name, role, period, hours, rate, amount, GST.
- PO number inclusion (mandatory for many government clients).
- Invoice numbering: sequential, configurable prefix per client or contract.
- Invoice format: PDF, with agency branding, ABN, bank details, payment terms.
- Support for consolidated invoices (multiple contractors on one invoice per client per period).
- Credit notes for timesheet disputes or billing corrections.

### 3.7.2 Xero Integration — Invoicing
- Push approved invoices to Xero as accounts receivable invoices.
- Sync invoice status (Draft, Approved, Sent, Paid, Overdue) between system and Xero.
- Record payments received in Xero; update system placement record as paid.
- Reconciliation report: invoices in system vs Xero.

### 3.7.3 Accounts Receivable
- Dashboard: total outstanding, overdue >30/60/90 days, by client.
- Automated payment reminders at 7, 14, and 30 days overdue.
- Escalation workflow: flag high-overdue accounts for manual follow-up.
- Bad debt write-off workflow with approval.

---

## Module 8: Accounts Payable & Bills

### 3.8.1 Xero Integration — Bills & Payments
- Contractor ABN invoices: import or manually enter contractor invoices; approve; push to Xero as bills.
- Partner agency invoices: record and approve; push to Xero.
- Operating expense bills (rent, insurance premiums, subscriptions): record; push to Xero.
- Payroll tax liabilities: generate as a bill in Xero on the payment due date.
- BAS liabilities (GST payable, PAYG withholding): generate as a bill in Xero.
- ABA payment file generation for bulk contractor payments.
- Record payments made in Xero; sync payment status back to system.

### 3.8.2 Expense Management
- Record agency operating expenses by category (recruitment, marketing, insurance, office, technology, professional fees).
- Allocate expenses to cost centres (by client or business unit if applicable).
- Approval workflow for expenses above a configurable threshold.

---

## Module 9: Reporting & Analytics

### 3.9.1 Financial Reports
- Gross margin by: placement, contractor, client, partner, month, quarter, year.
- Revenue forecast: based on active placements and known end dates.
- Payroll tax liability report (monthly and annual).
- FBT liability report (annual).
- TPAR report: annual taxable payments by contractor ABN.
- Accounts receivable ageing report.
- Accounts payable ageing report.
- Profit and loss (linked to Xero actuals).

### 3.9.2 Operational Reports
- Active placements by client, by role type, by clearance level.
- Pipeline report: opportunities in progress by stage.
- Contractor bench report: cleared candidates available for placement with days since last placed.
- Contract expiry report: placements and contracts expiring in the next 30/60/90 days.
- Compliance report: contractors with expiring documents (visa, clearance, cert).
- Partner agency performance: candidates placed, margin generated, split paid.
- BuyICT opportunity tracking: opportunities identified, bid, won, lost.
- LinkedIn sourcing effectiveness: candidates sourced, submitted, placed.

### 3.9.3 Dashboards
- Executive dashboard: revenue, margin, headcount on hire, pipeline value.
- Recruitment dashboard: open roles, candidate pipeline, submissions pending, timesheets outstanding.
- Compliance dashboard: expiring licences, insurances, contractor documents.
- Finance dashboard: invoices outstanding, bills due, payroll tax accrual.

---

## Module 10: System Administration & Security

### 3.10.1 User Roles & Access
- Roles: Administrator, Finance Manager, Account Manager, Recruitment Consultant, Partner Agency User, Contractor (candidate portal), Client Approver.
- Role-based access control (RBAC): each role has defined read/write/approve permissions per module.
- Multi-factor authentication (MFA) mandatory for all users.
- Single Sign-On (SSO) support (Google Workspace, Microsoft 365).

### 3.10.2 Data Privacy & Security
- All PII encrypted at rest and in transit (AES-256, TLS 1.3).
- Audit log: record all data access, changes, and deletions.
- Data retention policy: candidate data retained for 7 years post last activity (ATO requirement), or deleted on request where legally permitted.
- Candidate right-to-erasure workflow (Privacy Act compliance).
- Data residency: all data stored in Australian data centres.

### 3.10.3 Document Management
- Centralised document store linked to candidates, placements, clients, and contracts.
- Version control for contracts and agreements.
- E-signature integration (e.g., DocuSign or Adobe Sign) for contractor agreements and client contracts.
- Document expiry tracking with automated alerts.

### 3.10.4 Integrations Summary
| System | Integration Type | Direction |
|---|---|---|
| LinkedIn | OAuth API | Bidirectional |
| BuyICT Digital Marketplace | REST API / scrape | Inbound |
| Xero | Xero API (OAuth 2.0) | Bidirectional |
| ATO (TPAR, STP) | ATO API / file upload | Outbound |
| E-signature platform | API | Outbound |
| Bank (ABA file) | File export | Outbound |
| Email (SMTP/Microsoft 365) | SMTP / Graph API | Bidirectional |
| SMS gateway | API | Outbound |

---

## 4. Non-Functional Requirements

| Requirement | Specification |
|---|---|
| Availability | 99.9% uptime during business hours (AEST/AEDT) |
| Performance | Page load < 2 seconds; report generation < 10 seconds |
| Scalability | Support up to 500 active contractors and 1,000 candidate profiles initially |
| Data residency | Australian data centres only (e.g., AWS Sydney, Azure Australia East) |
| Backup | Daily automated backups; 30-day retention; point-in-time restore |
| Disaster recovery | RTO < 4 hours; RPO < 1 hour |
| Audit logging | All create/update/delete operations logged with user and timestamp |
| Mobile | Responsive web application; native mobile app for timesheet submission |
| Accessibility | WCAG 2.1 AA compliance |
| Browser support | Chrome, Edge, Firefox, Safari (latest 2 versions) |

---

## 5. Key Entities & Data Model Summary

- **Candidate**: profile, skills, clearance, documents, placements history
- **Client**: organisation, contacts, contracts, purchase orders
- **Placement**: links Candidate ↔ Client ↔ Contract; bill rate, pay rate, margin
- **Contract**: client contract (MSA/SOW), contractor agreement, partner agreement
- **Job**: open role brief; links to BuyICT opportunity or internal demand
- **Timesheet**: linked to Placement; approved by Client; drives Invoice and Pay
- **Invoice**: linked to Client and Timesheets; synced to Xero
- **Bill**: contractor pay, partner commission, operating expenses; synced to Xero
- **Partner Agency**: profile, agreement, shared candidates, margin splits
- **Insurance**: policy type, insurer, policy number, coverage, expiry
- **Licence**: Labour Hire Licence, ACT; expiry; renewal status

---

*Document prepared for system design and procurement purposes. All tax rates and thresholds current as at FY2025–26 and subject to change.*
