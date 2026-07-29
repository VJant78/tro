# PROJECT-005 — Security threat model

- Status: review
- Owner: Security Agent
- Reviewers: Lead, Backend, DevOps, QA
- Risk: high
- Dependencies: PROJECT-001, PROJECT-003
- File scope: `docs/SECURITY.md`

## Goal

Threat-model auth, authorization, PII, payment/idempotency, logs, backups va audit log.

## Acceptance criteria

- [x] Assets va trust boundaries duoc mo ta.
- [x] Required controls cho authn/authz/PII/validation/injection/CSRF/logs/backups duoc mo ta.
- [x] Security acceptance criteria duoc ghi.
- [x] Open risks duoc liet ke.

## Handoff

- Summary: Da hoan thien security threat model Phase 1.
- Changed files: `docs/SECURITY.md`.
- Verification: Manual doc review.
- Risks/assumptions: Chua chot auth/session/storage/retention.
- Remaining work: Security review lai truoc Phase 2.
- Suggested next owner: Lead, Security.
