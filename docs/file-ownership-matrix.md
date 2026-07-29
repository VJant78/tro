# File Ownership Matrix — Phase 2 Review

## Current ownership

| Agent        | Status         | Task                    | File scope                                                                                                                              |
| ------------ | -------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Lead         | Review         | Phase 2 integration     | `TASKS.md`, `docs/file-ownership-matrix.md`, review/integration docs                                                                    |
| Product      | Review         | PROJECT-001             | `docs/product-brief.md`, `docs/business-rules.md`, `docs/user-stories.md`, `docs/acceptance-criteria.md`, `docs/specs/PRODUCT_BRIEF.md` |
| UI/UX        | Review         | PROJECT-002             | `docs/ui-ux-spec.md`                                                                                                                    |
| Architecture | Review         | P2-001                  | `docs/decisions/**`, `docs/ARCHITECTURE.md`, `docs/api-design.md`                                                                       |
| Database     | Review/Blocked | P2-003, B-004           | `packages/database/**`                                                                                                                  |
| Backend      | Review         | P2-004, P2-006, P2-007  | `apps/api/**`                                                                                                                           |
| Frontend     | Review         | P2-005                  | `apps/web/**`, `packages/ui/**`                                                                                                         |
| Security     | Review         | P2-006/P2-007 review    | `docs/SECURITY.md`, review reports unless assigned                                                                                      |
| QA           | Review         | P2-008                  | `tests/**`, test config assigned by Lead                                                                                                |
| DevOps       | Blocked        | B-003 Docker validation | root tooling config, `.github/**`, Docker files, deployment docs                                                                        |

## Phase 2 proposed file ownership

| Scope                  | Owner                                        | Reviewers                           | Not edited by                          |
| ---------------------- | -------------------------------------------- | ----------------------------------- | -------------------------------------- |
| `apps/web/**`          | Frontend Agent                               | UI/UX, QA, Security, Lead           | Backend, Database                      |
| `apps/api/**`          | Backend Agent                                | QA, Security, Lead                  | Frontend, Database                     |
| `packages/database/**` | Database Agent                               | Backend, Security, Lead             | Frontend                               |
| `packages/ui/**`       | Frontend Agent                               | UI/UX, QA, Lead                     | Backend, Database                      |
| `packages/config/**`   | DevOps Agent                                 | Lead, Backend, Frontend             | Feature agents unless assigned         |
| `tests/**`             | QA Agent                                     | Lead, relevant implementation agent | Production-code owners unless assigned |
| `.github/**`           | DevOps Agent                                 | Lead, Security                      | Frontend, Backend, Database            |
| `docs/decisions/**`    | Architecture Agent                           | Lead, Security, affected agents     | Unassigned agents                      |
| `docs/**`              | Assigned doc owner                           | Lead                                | Agents without assigned doc scope      |
| Root config files      | DevOps Agent or Lead-designated single owner | Lead                                | All others during active task          |

## Locked until Phase 2 acceptance

No implementation agent may begin Phase 3 changes in these scopes until Phase 2 is explicitly accepted by the owner:

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
- Phase 3 can start only after owner acceptance of P2-001 through P2-008, plus explicit handling of B-003 and B-004.
