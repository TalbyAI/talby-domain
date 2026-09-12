# Visual Source annotations and behavioral isolation

Decision approved by the user on September 12, 2026. Its incorporation is subject to Pull Request review; [Define the extensible format for the first-delivery Visual Source](https://github.com/TalbyAI/talby-domain/issues/11) remains open until that Pull Request is merged.

## Decision

The first-delivery Visual Source is a separate RDF source with its own ontology. It is scoped to one Module and annotates stable semantic declaration IRIs. The source is representation metadata only: it cannot change the Semantic Source, the effective model, contract compatibility, permissions, routes, payloads, mocking, or execution.

The visual vocabulary uses the parallel namespace `https://github.com/TalbyAI/talby-domain/vocab/visual#`, abbreviated as `visual:`. The approved SHACL namespace remains `https://github.com/TalbyAI/talby-domain/vocab/shapes#`.

The profile uses an annotation graph rather than a second semantic identity. A declaration IRI is the subject of its visual predicates; the profile does not introduce a `VisualElement` wrapper, visual-only nodes, or a second identifier. A declaration may have no visual annotation, and it has at most one core annotation in this profile.

## Core vocabulary

The core visual predicates are:

- `visual:x` and `visual:y`, an optional pair of finite `xsd:decimal` coordinates;
- `visual:width` and `visual:height`, an optional pair of non-negative `xsd:decimal` dimensions;
- `visual:fill` and `visual:stroke`, optional `xsd:string` colors in `#RRGGBBAA` form;
- `visual:extension`, an optional link to explicitly preserved extension content.

Coordinates use a logical two-dimensional canvas with the origin at the top left, increasing rightward and downward, and no physical unit. The profile does not define a layout algorithm, rendering technology, custom labels, themes, responsive rules, connectors, or interaction.

The vocabulary does not duplicate semantic names, descriptions, routes, or identifiers. A renderer may use semantic metadata for display, but visual text is not a second contract field.

## Shapes and preservation

The core shape is closed and checks known predicates, cardinalities, datatypes, coordinate pairing, non-negative dimensions, and the color lexical form. Unknown core predicates are structural errors; extension data belongs below `visual:extension` and is preserved as RDF graph content even when a tool cannot interpret it. Preservation does not promise byte-for-byte preservation of Turtle formatting.

Structural errors are reported as errors. A syntactically valid annotation whose declaration IRI is absent from the selected Semantic Source is retained as an orphan with a visible non-blocking diagnostic. It is not applied to another declaration and cannot affect semantic execution. No IRI is dereferenced automatically, and extension content cannot execute code or fetch external assets.

## Compatibility and execution boundary

Execution selects Semantic Sources and, optionally, a Mocking Source; it does not consume the Visual Source. A visual-only edit therefore leaves the effective model, generated client behavior, HTTP contract, authorization, mocking results, and semantic compatibility classification unchanged. A future Publication may fingerprint the Visual Source separately, but source versioning and visual fingerprints are not introduced by this profile.

## Acceptance boundary

The eventual conformance evidence must demonstrate that:

1. a valid annotation preserves its stable target through semantic rename or reorganization;
2. invalid core data is rejected and unknown extension data survives round-tripping;
3. an orphan target is retained with a diagnostic and has no execution effect;
4. changing only visual data leaves the effective semantic model and execution results unchanged; and
5. visual sources do not trigger network loads or script execution.

Multiple visual views, visual-only elements, connectors, layout execution, editor behavior, external assets, themes, interaction, source versioning, and visual compatibility reports remain outside this delivery.
