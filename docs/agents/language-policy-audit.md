# Language-policy audit

Date: 2026-09-10
Repository baseline: `origin/main` at `612eb0b`
Migration comparison point: `4cc1365`
Ticket: [#29](https://github.com/TalbyAI/talby-domain/issues/29)

## Result

**PASS after corrections — two protected literals were restored; no further corrections are required before integration.**

| Check | Result |
| --- | --- |
| In-scope inventory | 21 tracked documents, including this audit record, match the inventory in `AGENTS.md`. Before this record was added, the corpus contained 20 documents. `.gitignore` is repository configuration, not canonical documentation. |
| Production source scope | No production source exists outside `prototypes/`; no source documentation was missed. |
| Repository language | Human-authored normative prose uses English and the canonical vocabulary. Spanish text that remains is an exact prototype label, sample value, or content inside a protected prototype block. |
| Map decision records | The map has exactly #2–#9, #11, and #21 as children. #1–#8 and #21 have additive English companion comments; open questions #9 and #11 remain untranslated. All nine companion-comment links resolve. |
| Protected examples | The 16 pre-existing Markdown files changed by the migration retain the same fenced code blocks as `4cc1365`; the new map inventory has no comparison predecessor. |
| Protected contract literals | The audit restored `Link: <effective-route-URL>` in `CONTEXT.md` and the prototype origin values `declarado` and `derivado` in `docs/specification.md`. The final values match the source examples and prototype. |
| Serialized examples and commands | The fenced serialized examples, command blocks, and technical literals retain their original contents; no protected fenced block changed in the 16 pre-existing Markdown files. |
| Navigation and cross-references | All local Markdown link targets resolve. There are no local fragment links requiring anchor repair. Heading hierarchy changes are limited to the authorized language-policy section in `AGENTS.md`; the seven ADR numbers and filenames are unchanged. |
| Scope integrity | The completed migration, before this audit record, contained 17 Markdown files, zero files under `prototypes/`, and no runtime or generated files. |
| Whitespace | `git diff --check 4cc1365..HEAD` passes. |

## Document inventory

| Document | Classification | Treatment |
| --- | --- | --- |
| `AGENTS.md` | Root guidance | Policy and checklist reviewed. |
| `CONTEXT.md` | Domain glossary | English glossary reviewed; protected route literal restored. |
| `docs/adr/0001-especificacion-progresiva.md` | ADR | Translated and reviewed. |
| `docs/adr/0002-asentamiento-independiente.md` | ADR | Translated and reviewed. |
| `docs/adr/0003-actividades-y-autoridad-del-estado.md` | ADR | Translated and reviewed. |
| `docs/adr/0004-restricciones-acumulativas.md` | ADR | Translated and reviewed. |
| `docs/adr/0005-identidad-independiente-del-namespace.md` | ADR | Translated and reviewed. |
| `docs/adr/0006-fuentes-rdf-por-aspecto.md` | ADR | Translated and reviewed. |
| `docs/adr/0007-perfil-cel-acotado.md` | ADR | Translated and reviewed. |
| `docs/agents/domain.md` | Agent guidance | Translated and reviewed. |
| `docs/agents/issue-tracker.md` | Process guidance | Translated and reviewed. |
| `docs/agents/language-policy-audit.md` | Audit record | Added and reviewed. |
| `docs/agents/triage-labels.md` | Process guidance | Translated and reviewed. |
| `docs/research/continuation-token.md` | Research | Translated and reviewed. |
| `docs/research/formas-lexicas.md` | Research | Translated and reviewed; sample literals preserved. |
| `docs/research/map-decision-records.md` | Map inventory | Added and reviewed; settled and open records classified. |
| `docs/specification.md` | Specification | Translated and reviewed; prototype literals restored. |
| `docs/superpowers/plans/2026-09-07-effective-contract-inspector.md` | Implementation plan | Translated and reviewed; excluded prototype content preserved. |
| `docs/superpowers/specs/2026-09-07-effective-contract-inspector-design.md` | Design specification | Translated and reviewed. |
| `docs/superpowers/specs/2026-09-08-http-contract-probe-design.md` | Design specification | Translated and reviewed. |
| `samples/projects.md` | Sample | Translated and reviewed; contract values preserved. |

## Deliberate exclusions

- All content under `prototypes/` remains outside the migration scope.
- Historical GitHub issue bodies, comments, reviews, and other published communication were not rewritten.
- The open map questions in #9 and #11 remain historical records until their decisions settle.

## Corrections applied

- Restored the protected `Link` header placeholder in `CONTEXT.md`.
- Restored the protected prototype origin values in `docs/specification.md`.

No further repository correction is needed from this audit.
