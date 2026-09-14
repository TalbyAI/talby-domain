# Agent Brief: implement Visual Source–Module binding

This brief turns [ADR-0008](../../adr/0008-fuente-visual-anotaciones.md) and [ADR-0009](../../adr/0009-vinculo-ejecutable-fuente-visual-modulo.md) into the bounded implementation task for [Issue #36](https://github.com/TalbyAI/talby-domain/issues/36). It is downstream of [Issue #37](https://github.com/TalbyAI/talby-domain/issues/37), which must expose the verified Semantic Source and effective-model ownership seam first.

## Required boundary

Implement one read-only binding operation at the highest available seam:

```text
bindVisualSource(visualSourceGraph, effectiveSemanticModel) -> visualBindingResult
```

The operation must consume #37's declaration index and Module ownership data. It must not parse or materialize the Semantic Source again, and its result must not be passed to semantic execution.

## Binding contract

1. The Visual Source contains exactly one `visual:VisualSource` descriptor with exactly one `visual:module` IRI.
2. The selected IRI resolves only among the loaded, verified Semantic Source declarations and must identify a Module.
3. Visual annotation subjects are stable Declaration Identifier IRIs. The core annotation shape and extension rules remain those of ADR-0008.
4. Ownership is the root Module reached through `parent`; the Module itself owns itself. A target is applied only when it has exactly one owner and that owner is the selected Module.
5. The result separates `applied`, `orphans`, and `diagnostics`. The input graph is not rewritten or mutated.

## Diagnostic contract

An orphan diagnostic has these stable fields:

```text
severity: "warning"
code: "VISUAL_TARGET_ORPHAN"
reason: "missing-target" | "cross-module" | "ambiguous-owner" | "unowned-target"
target: Declaration Identifier IRI
selectedModule: Module IRI
ownerModule?: Module IRI
ownerModules?: Module IRI[]
```

Structural and binding errors remain blocking diagnostics for visual binding. They must not create a partial applied result. Orphan-only input is usable and applies every valid same-Module annotation.

## Observable acceptance cases

| Case | Required result |
| --- | --- |
| One valid same-Module target | Annotation is applied to that Declaration Identifier. |
| Missing target | Original triples remain; target is an orphan with `missing-target`; no application occurs. |
| Target owned by another loaded Module | Original triples remain; target is an orphan with `cross-module` and the resolved owner; no application occurs. |
| Target with no or multiple owners | Target is an orphan with `unowned-target` or `ambiguous-owner`; no context is guessed. |
| Invalid source descriptor, module binding, or core annotation | Visual binding fails without an applied result. |
| Valid annotations plus orphan targets | Valid same-Module annotations apply; orphan diagnostics remain visible. |
| Semantic rename or reorganization with the same Declaration Identifier | The annotation remains anchored to the same declaration. |
| Visual-only source change | Effective model, semantic compatibility, permissions, routes, payloads, mocking, and execution are unchanged. |
| Extension or orphan round-trip | RDF graph content survives semantically and remains inert. |
| External or executable extension IRI | No network request, dereference, script execution, or layout execution occurs. |
| Repeated validation of the same graphs | The result and diagnostic ordering are deterministic. |

## Exclusions

Do not add a visual editor, renderer, layout algorithm, multiple views, visual-only semantic elements, external assets, source versioning, visual compatibility, script execution, network dereferencing, or a second semantic identity. Do not modify the original exploratory sample or add prototype dependencies. Do not duplicate #37's Contract Layer implementation.

Completion requires focused conformance coverage for same-Module, missing-target, cross-Module, ownership ambiguity, invalid binding, graph preservation, and semantic execution isolation at the public boundary.
