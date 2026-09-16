# RDF/JS Contract Layer Migration Design

**Status:** Approved for planning

**Scope:** Issue #40, “Migrate Contract Layer RDF operations to RDF/JS and structural SHACL validation”.

## Goal

Replace the handwritten Turtle parser and array-based graph operations behind the existing Semantic Source seam with a small, pinned RDF/JS stack while keeping the public inspection and effective-model results data-only and behaviorally compatible.

The migration covers Semantic Source loading, local graph matching, Turtle serialization, and the first structural SHACL adapter. It does not change the public Contract Layer vocabulary, effective-model semantics, Visual Source behavior, or external adapters.

## Options considered

1. **Private RDF/JS dataset with a stable DTO boundary (selected).** N3 owns parsing, RDF/JS terms, quads, storage, matching, and writing. A private `DatasetCore` is associated with each loaded source; public results continue to expose serializable term DTOs. This satisfies RDF/JS semantics without leaking package objects.
2. **Expose RDF/JS quads and datasets directly.** This would reduce conversion code, but would make downstream callers depend on package-specific objects and break the existing inspection seam.
3. **Parse with N3 and immediately return to custom arrays.** This would minimize the diff, but would leave matching and equality dependent on handwritten array behavior and would not deliver the approved RDF/JS migration.

## Architecture

### Dependencies

Add a private ESM package manifest and lockfile with exact direct dependencies:

- `n3@2.7.12` for strict Turtle parsing, RDF/JS terms and quads, `Store`/`DatasetCore`, and Turtle writing.
- `rdf-validate-shacl@0.6.5` for the initial SHACL Core validation adapter.

Use a local dataset-factory bridge built from N3 `DataFactory` and `Store`; do not add `rdf-ext`, Comunica, or `@zazuko/env-node`. The package manifest exposes the existing Node test command through `npm test` and declares Node `>=22.5.0`, the runtime required by the current `node:sqlite` usage.

### Semantic Source loading

`loadSemanticSource` will keep its current input forms: Turtle text or a data-only graph. Turtle text is parsed with `new Parser({ format: "text/turtle" })`, so permissive N3/N-Triples/N-Quads extensions are not accepted accidentally. No parser callback or loader may dereference an IRI.

The loader creates a private N3 `Store` for each source and associates it with the returned source object through a module-local `WeakMap`. The returned `source.graph` remains an array of serializable DTO triples with the current term shape, including lexical literal values, datatype IRIs, language values, and blank-node terms. RDF/JS package objects are therefore never reachable through `inspectSemanticSource` or the effective model.

When an existing graph is supplied, the loader reconstructs RDF/JS terms without coercing typed literals or blank nodes, inserts quads into the same store, and lets RDF/JS dataset equality remove repeated statements. The source snapshot and its input remain separate objects.

### Matching and serialization

All Semantic Source lookups used by the acceptance module will call a small data-only helper backed by `DatasetCore.match`. It will return DTO quads, not RDF/JS objects. Declaration lookup, parent traversal, ownership resolution, RDF list traversal, and extension traversal will use this helper or direct private dataset access.

Serialization will use `N3.Writer` over the private dataset. The result is a semantically equivalent Turtle document, not a byte-for-byte reproduction of the input. Round-trip tests will compare RDF/JS dataset content and explicitly cover blank nodes, typed literal lexical values, lists, repeated statements, and inert extension triples.

### SHACL adapter

Add an asynchronous adapter that accepts already-loaded data and shape datasets, invokes `rdf-validate-shacl` with the local N3 dataset factory, and returns only Talby diagnostic data. It will not pass an IRI importer; imports and network-backed shape loading are rejected.

The adapter maps each validation result to stable `code`, `rule`, `target`, `paths`, and `detail` fields. Constraint component and source shape values provide the rule identity. For simple predicate paths in the approved profile, the final IRI fragment is escaped as one JSON Pointer segment; unsupported path expressions produce a stable `SHACL_PATH_UNSUPPORTED` diagnostic instead of an invented business path. Results are sorted by a stable tuple of code, rule, target, paths, and detail. The raw validator report and report dataset never cross the public seam.

The existing Talby semantic verification remains separate and blocking. No unapproved complete shape catalog is invented in this migration; a synthetic SHACL Core shape exercises the adapter, while the current project fixture continues to be checked by the established semantic rules until concrete Contract Layer shapes are specified.

### Acceptance integration

`contract-acceptance.mjs` will stop scanning `source.graph` arrays for local graph operations and use the data-only dataset-match helper instead. Its generated client, effective model, SQLite boundary, authorization, mocking, compatibility, and response shapes remain unchanged.

## Safety and limits

The source boundary will enforce explicit ceilings before exposing a dataset: 1 MiB of UTF-8 Turtle input, 10,000 parsed quads, and 1,000 normalized SHACL diagnostics. Each normalized diagnostic detail is limited to 16 KiB of UTF-8 and the aggregate normalized diagnostics are limited to 1 MiB before sorting. These defaults are above the 90-quad project fixture and tested at their boundaries; callers may not disable them. No reasoning, SPARQL engine, implicit IRI dereferencing, extension execution, or external adapter is introduced.

## Verification

Existing tests must remain green. New focused coverage will include:

- strict Turtle acceptance and rejection of malformed or unsupported syntax;
- N3 Turtle round-trips and RDF/JS term equality;
- blank nodes, RDF lists, typed-literal lexical preservation, repeated statements, and extension preservation;
- direct dataset matching and deterministic declaration/Module ownership results;
- SHACL `minCount` success/failure, Talby diagnostic normalization, path mapping, and repeatable ordering;
- source, quad, and diagnostic resource limits;
- no package-specific objects in public inspection/effective-model results and no network activity.

Run `npm test`, the focused Node test files, `npm audit`, and a direct/transitive dependency-license review using package metadata plus the generated lockfile. Only source, tests, package metadata, and this design/plan documentation may change; prototypes, Visual Source code, samples, and unrelated public contracts remain untouched.
