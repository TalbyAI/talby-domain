# Visual Source–Module binding design

This design implements Issue #36 within the boundaries settled by [ADR-0008](../../adr/0008-fuente-visual-anotaciones.md), [ADR-0009](../../adr/0009-vinculo-ejecutable-fuente-visual-modulo.md), and the [Agent Brief](2026-09-14-visual-source-module-binding-agent-brief.md).

## Scope and public seam

Add one standalone public operation:

```text
bindVisualSource(visualSourceGraph, effectiveSemanticModel) -> visualBindingResult
```

The operation lives in `src/visual-layer.mjs`. It consumes the existing effective model's `declarationIndex` and `moduleOwnership`; it does not load, verify, or materialize a Semantic Source. The Contract Layer acceptance service remains unchanged and never consumes Visual Source data.

`visualSourceGraph` uses the existing RDF/Turtle boundary: Turtle text, a loaded source, a `{ graph }` value, or an iterable RDF/JS graph. It is normalized into data-only triples. No IRI is dereferenced and no executable or layout behavior is introduced.

## Binding and result

The Visual Source must contain exactly one `visual:VisualSource` descriptor and exactly one `visual:module` IRI. The IRI must identify a loaded `Module` in the effective model.

The result is a new value and never a rewritten graph:

```text
{
  status: "bound" | "blocked",
  selectedModule: Module IRI | null,
  applied: [{ target: Declaration Identifier IRI, triples: PublicTriple[] }],
  orphans: [{ target: Declaration Identifier IRI, triples: PublicTriple[], diagnostic }],
  diagnostics: Diagnostic[]
}
```

Each annotation is grouped by its stable subject IRI. Its direct triples and reachable `visual:extension` content are copied into `triples`, preserving inert extension and orphan content. Applied annotations require exactly one owner equal to the selected Module.

## Validation and diagnostics

Blocking validation rejects missing or multiple descriptors, invalid descriptor/module bindings, non-IRI targets, unknown core predicates, invalid cardinalities, unpaired coordinates or dimensions, invalid decimal/dimension values, invalid colors, and malformed visual graph input. A blocked result has no applied or orphan annotations.

Missing targets, cross-Module targets, ambiguous ownership, and unowned targets are retained as orphans. Their deterministic diagnostics use exactly the stable orphan shape from ADR-0009:

```text
{
  severity: "warning",
  code: "VISUAL_TARGET_ORPHAN",
  reason,
  target,
  selectedModule,
  ownerModule?,
  ownerModules?
}
```

Annotations and diagnostics are sorted by stable target and reason. Valid same-Module annotations remain applied when other annotations are orphaned.

## Verification seam

Focused tests exercise valid same-Module binding, missing/cross-Module/ambiguous/unowned targets, invalid visual structure and module binding, graph and extension preservation, stable identifiers after semantic reorganization, deterministic repeated validation, and isolation from semantic execution. The existing Contract Layer and acceptance tests must continue to pass unchanged.
