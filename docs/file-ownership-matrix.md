# File Ownership Matrix — Phase 2 Planning

## Current ownership

| Agent | Status | Task | File scope |
|---|---|---|---|
| Lead | Awaiting approval | Phase 2 planning | `TASKS.md`, `docs/file-ownership-matrix.md`, review/integration docs |
| Product | Review | PROJECT-001 | `docs/product-brief.md`, `docs/business-rules.md`, `docs/user-stories.md`, `docs/acceptance-criteria.md`, `docs/specs/PRODUCT_BRIEF.md` |
| UI/UX | Review | PROJECT-002 | `docs/ui-ux-spec.md` |
| Architecture | Ready | P2-001 | `docs/decisions/**`, `docs/ARCHITECTURE.md`, `docs/api-design.md` |
| Database | Ready | P2-003 | `packages/database/**` |
| Backend | Ready | P2-004, P2-006, P2-007 | `apps/api/**` |
| Frontend | Ready | P2-005 | `apps/web/**`, `packages/ui/**` |
| Security | Review/Ready | P2-006/P2-007 review | `docs/SECURITY.md`, review reports unless assigned |
| QA | Ready | P2-008 | `tests/**`, test config assigned by Lead |
| DevOps | Ready | P2-002 | root tooling config, `.github/**`, Docker files, deployment docs |

## Phase 2 proposed file ownership

| Scope | Owner | Reviewers | Not edited by |
|---|---|---|---|
| `apps/web/**` | Frontend Agent | UI/UX, QA, Security, Lead | Backend, Database |
| `apps/api/**` | Backend Agent | QA, Security, Lead | Frontend, Database |
| `packages/database/**` | Database Agent | Backend, Security, Lead | Frontend |
| `packages/ui/**` | Frontend Agent | UI/UX, QA, Lead | Backend, Database |
| `packages/config/**` | DevOps Agent | Lead, Backend, Frontend | Feature agents unless assigned |
| `tests/**` | QA Agent | Lead, relevant implementation agent | Production-code owners unless assigned |
| `.github/**` | DevOps Agent | Lead, Security | Frontend, Backend, Database |
| `docs/decisions/**` | Architecture Agent | Lead, Security, affected agents | Unassigned agents |
| `docs/**` | Assigned doc owner | Lead | Agents without assigned doc scope |
| Root config files | DevOps Agent or Lead-designated single owner | Lead | All others during active task |

## Locked until approval

No implementation agent may edit these scopes until Phase 2 is explicitly approved:

- `apps/web/**`
- `apps/api/**`
- `packages/ui/**`
- `packages/database/**`
- `packages/config/**`
- `tests/**`
- `.github/**`

## Notes

- No two active implementation agents may edit the same source scope concurrently.
- Shared root config changes must have a single assigned owner.
- QA and Security review agents do not change production code unless Lead creates a specific fix task.
- Phase 2 can start only after owner approval and P2-001 ADR.
