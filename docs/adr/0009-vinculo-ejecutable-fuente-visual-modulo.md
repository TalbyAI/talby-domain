# Executable Visual Source–Module binding

ADR-0008 settles the Visual Source format and its behavioral isolation. Issue [#36](https://github.com/TalbyAI/talby-domain/issues/36) needs an executable boundary that applies that decision without duplicating Semantic Source loading or effective-model materialization.

## Decision

A Visual Source contains exactly one source descriptor typed `visual:VisualSource` and exactly one `visual:module` IRI. The descriptor may be a blank node because it is source metadata, not a semantic declaration. The referenced IRI must resolve to one loaded Module in the verified Semantic Source; no IRI is dereferenced. Missing or multiple descriptors, module links, or an unresolved/non-Module binding are structural or binding errors and produce no applied visual result.

Visual binding consumes the declaration-ownership seam from the effective model produced by #37. A declaration owns the root Module reached through its semantic `parent` chain; a Module owns itself. A target is applicable only when its stable Declaration Identifier exists and has exactly one owner equal to the selected Module. Missing, cross-Module, ambiguous, and unowned targets remain as Orphan Visual Annotations and are never applied. A non-IRI target is invalid because visual annotations anchor to stable declaration IRIs.

The original Visual Source graph and Semantic Source remain unchanged. Binding returns a separate result containing the selected Module, applicable annotations, orphan annotations, and diagnostics. Structural visual errors produce no applicable annotations; orphan diagnostics are warnings, so valid same-Module annotations may still be applied. Visual validation does not prevent Semantic Source execution because execution does not consume Visual Source data.

Orphan diagnostics expose stable `severity`, `code`, `reason`, `target`, and `selectedModule` fields. `ownerModule` is included for a unique non-selected owner; `ownerModules` is included when ownership is ambiguous. The orphan code is `VISUAL_TARGET_ORPHAN`, with reasons `missing-target`, `cross-module`, `ambiguous-owner`, or `unowned-target`. Reports are deterministic by target IRI and reason. Extensions, orphan triples, and unsupported visual content remain inert RDF graph data; no network load, script execution, layout execution, or semantic merge is permitted.

This decision deliberately treats ownership ambiguity as an orphan rather than choosing a referencing context. A later profile may introduce contextual visual targets without changing the stable identity rule.
