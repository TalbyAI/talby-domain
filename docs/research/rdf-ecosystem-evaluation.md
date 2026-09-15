# RDF Ecosystem Evaluation

**Status:** decision recorded; production migration deferred to a follow-up

**Date:** 2026-09-15

**Scope:** Semantic Source loading, RDF/JS interoperability, local graph
operations, Turtle serialization, and structural SHACL validation. Visual
Source binding, external adapters, and production dependency changes are not
part of this research change.

## Decision

Adopt RDF/JS as the internal interoperability seam and use the following
stack as the migration target behind the existing Semantic Source seam:

1. `n3` for Turtle parsing and serialization, RDF/JS terms and quads, and
   in-memory `DatasetCore` operations.
2. `rdf-validate-shacl` for the first-delivery structural SHACL adapter,
   limited to the approved SHACL Core profile and Talby's own diagnostic
   normalization. Its lack of SHACL-SPARQL is acceptable because the first
   delivery does not require SPARQL constraints or targets.
3. Direct `DatasetCore.match` operations for declaration lookup, parent
   traversal, list traversal, and ownership resolution.
4. No full Comunica dependency for the first delivery. Add a query adapter
   only if the product later requires user-authored SPARQL, federation, or
   heterogeneous remote sources.

`rdf-ext` is not selected as a required foundation. It is a useful RDF/JS
environment and dataset convenience layer, but it does not replace the
parser/serializer by itself and brings a broader dependency surface than the
current seam needs.

`shacl-engine` remains a viable alternative if a later profile requires its
advanced or SPARQL-enabled SHACL features. It is not the smallest first
delivery because its optional SPARQL support and runtime dependency graph are
broader than the required structural profile.

This decision does not add production dependencies in this ticket. A future
migration must first add a package manifest and lockfile, preserve the public
seam, and land focused conformance tests in a separate change.

No ADR or Contract Layer plan change is required for this research result:
the recommendation preserves the existing domain and public inspection
interfaces. The separate migration change should update the plan if its
implementation details alter that boundary.

## Repository baseline

The canonical Semantic Source fixture is the exported
`PROJECT_SEMANTIC_SOURCE` value in `src/contract-acceptance.mjs`. It is the
fixture used below. `samples/projects.md` is an exploratory document using the
older `tdpo` vocabulary and is not the conformance fixture.

The current implementation has:

- a bounded handwritten `TurtleParser` in `src/contract-layer.mjs`;
- plain JavaScript triples rather than RDF/JS `Quad` objects;
- direct array filtering for graph matching and list traversal;
- a public `inspectSemanticSource(input)` seam; and
- a separate effective model exposing Declaration Identifier and Module
  ownership data.

The effective-model seam is the boundary to preserve. RDF package objects
must not leak into the public inspection result, and the source graph must
remain separate from the effective model.

The repository currently has no production `package.json` or RDF dependency.
The existing Contract Layer and acceptance tests pass with Node.js
`v24.14.1` (35 tests, 35 passed). Node reports its existing experimental
`node:sqlite` warning; the warning is unrelated to this evaluation.

## Standards and required semantics

RDF/JS deliberately defines low-level interoperable interfaces for terms,
quads, factories, and datasets rather than prescribing storage. Terms and
quads are immutable, and equality is defined by `.equals()` rather than object
identity. Literal equality includes lexical value, language, direction, and
datatype. The data model exposes `NamedNode`, `BlankNode`, `Literal`,
`DefaultGraph`, and `Quad` terms. See the [RDF/JS Data Model specification](https://rdf.js.org/data-model-spec/).

`DatasetCore` supplies `size`, `add`, `delete`, `has`, iteration, and
`match`. Matching applies RDF term equality to all supplied components and
returns a new dataset. A dataset is an unordered set; deterministic report
ordering therefore remains a Talby responsibility. Dataset equality and
containment normalize blank nodes, which is useful for structural round-trip
tests but is not a promise that a blank-node label survives serialization.
See the [RDF/JS Dataset specification](https://rdf.js.org/dataset-spec/).

The RDF/JS specifications do not validate IRI syntax or datatype lexical
values. That is correct for this project: the RDF layer may parse a typed
literal, while Semantic Source verification must still reject an invalid
contract value. Exact decimals must remain lexical strings at the public
contract boundary.

Turtle remains the source serialization. The [W3C Turtle recommendation](https://www.w3.org/TR/turtle/)
defines the syntax, while the RDF/JS interfaces keep parsing independent from
the graph model. The migration must therefore test both syntax conformance
and the project-specific closed-vocabulary and semantic rules.

## Reproducible probe

The probe ran on 2026-09-15 with Node.js `v24.14.1`. It installed pinned
candidate packages into a temporary directory only, using
`--ignore-scripts`, and removed that directory after the run. No repository
manifest, lockfile, source file, or production dependency was changed.

```text
n3@2.7.12
rdf-ext@2.6.0
shacl-engine@1.1.2
rdf-validate-shacl@0.6.5
@zazuko/env-node (for the rdf-validate-shacl Node environment)
```

The probe imported `PROJECT_SEMANTIC_SOURCE`, parsed it with N3 in strict
Turtle mode, placed the resulting quads in an rdf-ext dataset, serialized and
parsed them again, and exercised a small SHACL `minCount` shape over the
fixture's Module declaration. The repository has no concrete SHACL shape
graph yet; the synthetic shape tests the required validation/report boundary,
not the future complete shape catalog.

### Observed results

| Check | Result |
| --- | --- |
| Project fixture parses | 90 quads |
| N3 Turtle serialization and parse round-trip | 90 quads; rdf-ext dataset equality `true` |
| N3 and rdf-ext typed-literal equality | `true` for the same decimal lexical value and datatype |
| Dataset matching | One Module type match for the project Module |
| Blank nodes | Present and retained in the parsed graph; three subject/object occurrences in the fixture |
| RDF list | One `rdf:first` and one `rdf:rest` statement found for the normalizer list |
| Unknown extension triple round-trip | Preserved by the parser/writer probe |
| `shacl-engine` invalid/valid cases | `false` without the required name; `true` with it |
| `rdf-validate-shacl` invalid/valid cases | `false` with one result without the required name; `true` with it |
| Repeated invalid SHACL validation | Same normalized result summary on repeated runs |

The probe confirms interoperability and the basic capabilities needed by the
fixture. It does not prove exhaustive SHACL coverage, parser resource limits,
or every future contract shape; those belong in the migration's conformance
suite.

## Candidate comparison

The versions below are npm registry snapshots taken on 2026-09-15. The linked
package pages are the versioned provenance for the snapshot.

| Candidate | Snapshot and license | Relevant capability | Limits and maintenance signal |
| --- | --- | --- | --- |
| [`n3` 2.7.12](https://www.npmjs.com/package/n3/v/2.7.12) | MIT; Node `>=12` | Turtle, TriG, N-Triples, N-Quads, and N3 parsing/writing; RDF/JS DataFactory; in-memory Store/DatasetCore; Node streams and browser bundles. See the [official N3.js repository](https://github.com/rdfjs/N3.js/). | Does not validate all IRI or datatype lexical semantics; strict format must be requested because the default parser is permissive. N3 reasoning is a separate mutable facility and must not be enabled for untrusted input. Latest registry release in the snapshot: 2026-09-06. |
| [`rdf-ext` 2.6.0](https://www.npmjs.com/package/rdf-ext/v/2.6.0) | MIT | Developer-friendly RDF/JS environment bundling DataFactory, DatasetFactory, formats, namespace, term maps/sets, and traversal helpers. See the [official repository](https://github.com/rdf-ext/rdf-ext/). | It is an environment layer, not a Turtle parser or serializer. Its package metadata brings a broad set of RDF/JS and fetch-related dependencies; `ScoreFactory` is explicitly experimental. Latest registry release in the snapshot: 2025-08-31. |
| [`shacl-engine` 1.1.2](https://www.npmjs.com/package/shacl-engine/v/1.1.2) | MIT | RDF/JS `DatasetCore` input, SHACL Core, optional SPARQL constraints/targets, optional JavaScript/advanced features, debug/details/trace, coverage, and browser use through the project playground. See the [official repository](https://github.com/rdf-ext/shacl-engine/). | Its report API is not the same shape as `rdf-validate-shacl`; Talby still needs an adapter for stable codes, rules, and JSON Pointer paths. Package metadata includes `@comunica/query-sparql-rdfjs-lite` and other runtime helpers. Latest registry release in the snapshot: 2026-06-30. |
| [`rdf-validate-shacl` 0.6.5](https://www.npmjs.com/package/rdf-validate-shacl/v/0.6.5) | MIT | RDF/JS SHACL validation, standard `conforms`/result reporting, custom constraint validators, and a lighter browser export when data and shapes are already `DatasetCore` instances. See the [official package documentation](https://github.com/zazuko/rdf-validate-shacl/tree/master/packages/shacl). | It does not support SHACL-SPARQL. The Node environment needs `@zazuko/env-node`; browser use may require bundler polyfills unless the lighter web export is used. Latest registry release in the snapshot: 2025-05-30, so pin it and review maintenance before adoption. |
| [`@comunica/query-sparql` 5.4.1](https://www.npmjs.com/package/@comunica/query-sparql/v/5.4.1) | MIT | Full SPARQL query engine with local and multiple-source/URL query workflows. See the [official Comunica CLI documentation](https://comunica.dev/docs/query/getting_started/query_cli/) and [repository](https://github.com/comunica/comunica/). | Its full package has a large actor and transport graph and is designed for query execution over sources, including URLs. That is unnecessary for bounded local declaration traversal. Latest registry release in the snapshot: 2026-09-14. |

The unscoped [`comunica` package](https://www.npmjs.com/package/comunica) is not the meaningful first-delivery selection. The official CLI guide identifies
`@comunica/query-sparql` as the standard Comunica SPARQL engine; the scoped
package is the version evaluated above.

## Capability findings

### Parsing and serialization

N3 is the only candidate in this comparison that directly supplies the parser
and writer needed by the current seam. Its official documentation lists
Turtle, TriG, N-Triples, N-Quads, and N3 support, strict format selection,
streaming parsers, writers, and browser bundles. The [N3.js format and RDF/JS documentation](https://github.com/rdfjs/N3.js/)
also documents `Store.match` and the RDF/JS interfaces it implements.

The migration should use `new Parser({ format: "text/turtle" })` for this
source boundary rather than the permissive default. It should preserve the
original source text separately, keep the parsed dataset immutable to
consumers, and serialize RDF graph content rather than promising byte-for-byte
Turtle formatting.

### Terms, matching, blank nodes, lists, and extensions

N3 quads were accepted by rdf-ext's dataset implementation in the probe, and
terms created by N3 and rdf-ext compared equal through RDF/JS `.equals()`.
`DatasetCore.match` is sufficient for the current operations: exact
subject/predicate/object lookup, parent-chain traversal, list traversal, and
Module ownership. It also avoids making array order part of graph semantics.

N3 parses and writes blank-node property lists and RDF lists. RDF/JS treats
blank-node labels as term identifiers, while dataset structural equality may
normalize labels. The effective model must therefore continue to use stable
Declaration Identifier IRIs; blank nodes are appropriate for source-local
lists and extension content but must not become semantic declaration identity.

Unknown extension triples can be parsed, stored, and serialized by the RDF
layer. Whether they are allowed, rejected, or retained is a Semantic Source
vocabulary rule. The migration must keep extension content inert and must keep
the current closed-vocabulary diagnostics above the RDF library.

### SHACL and Talby diagnostics

Both SHACL candidates consumed RDF/JS datasets and returned the expected
conformance result for the probe's required-name shape. `rdf-validate-shacl`
exposes standard result properties such as focus node, path, severity, source
constraint component, source shape, and message, and exposes the validation
report as RDF data. Its official documentation also provides custom constraint
hooks and explicitly states that SHACL-SPARQL is unsupported.

`shacl-engine` supports SHACL Core out of the box and exposes optional SPARQL
validation/target modules, along with debug, details, trace, and coverage
options. Those features are useful for a future broader profile, but its
result representation and optional query support are more than the first
delivery needs.

Neither library owns Talby's semantic verification. SHACL reports must be
adapted into stable Talby diagnostic codes, rule identifiers, deterministic
ordering, and JSON Pointer paths. Semantic checks such as declaration identity,
parent cycles, cumulative constraints, exact decimal lexical rules, and
effective-model materialization remain outside SHACL. The [W3C SHACL validation specification](https://www.w3.org/TR/shacl/)
defines the graph validation vocabulary; it does not define this project's
semantic verifier or HTTP error format.

### Querying

The loaded first-delivery Semantic Source is a bounded local dataset. Direct
dataset matching is enough for all current graph operations and is easier to
keep deterministic and network-free. Comunica is appropriate when a future
profile needs SPARQL algebra, user-authored queries, federation, or remote
source discovery. Its official CLI documentation centers on querying one or
more sources, including URLs; that is outside this module's trust boundary.

`shacl-engine`'s optional SPARQL support does not change this decision. If it
is adopted later, its optional validation module must receive only the loaded
dataset and must not be allowed to dereference arbitrary IRIs.

### Node, browser, and security

N3's package declares Node `>=12` and publishes browser builds. The RDF/JS
specifications expose the core interfaces to Window and Worker environments.
`rdf-validate-shacl` documents a Node environment and a lighter web export;
the Node-oriented environment may require bundler polyfills in the browser.
`shacl-engine` documents client-side use through its browser playground.

No candidate should receive an implicit network loader. The application must
pass already-loaded datasets, leave `importGraph`-style hooks unset unless an
explicit trusted adapter is supplied, and reject or preserve external IRIs
according to the source policy without dereferencing them.

N3's optional reasoning facility is mutable and has unbounded defaults unless
budgets are supplied. It is not part of the Contract Layer first delivery.
All parsers and validators still need application limits for source bytes,
quad count, nested blank-node/list depth, validation results, and execution
time. A package's ability to parse a lexical form does not make that form
valid for the Semantic Source.

### License and maintenance

All four RDF/SHACL candidates evaluated here are MIT-licensed. The selected
Comunica package is also MIT-licensed. License approval for a future migration
must include the complete transitive dependency tree, not only the direct
package metadata.

The npm snapshot shows active recent releases for N3, shacl-engine, and
Comunica, while rdf-ext and rdf-validate-shacl have older latest package
releases despite active repositories and ecosystems. This is a maintenance
signal, not a quality verdict. A production migration must pin exact versions,
run `npm audit` and the repository's normal dependency checks, record the
lockfile, and review upstream security advisories before merge. No security
claim is inferred from stars, issue counts, or release recency alone.

## Adapter boundaries

The RDF module accepts text or already-materialized RDF terms/quads. The
following concerns remain outside it:

| Concern | Owning boundary | RDF module receives |
| --- | --- | --- |
| Local Windows files | Node `node:fs`/`node:fs/promises` and stream adapter; see the [Node filesystem API](https://nodejs.org/api/fs.html). | Bytes or text plus source metadata |
| SharePoint, OneDrive, Microsoft Graph | Authenticated Microsoft Graph adapter handling credentials, permissions, retries, resource IDs, and response mapping; see the [`driveItem` API](https://learn.microsoft.com/en-us/graph/api/driveitem-get?view=graph-rest-1.0) and [external content connector overview](https://learn.microsoft.com/en-us/graph/connecting-external-content-connectors-api-overview). | Retrieved source bytes/text only |
| PDF ingestion | PDF extraction/rendering adapter such as [PDF.js](https://mozilla.github.io/pdf.js/); OCR, page selection, and extraction quality remain its concerns. | Explicitly mapped text or metadata, if a later feature needs it |
| Authentication | Application/API boundary and identity provider integration. | An authorized operation or already-authorized source, never credentials |
| External business systems | Explicit External Activity/integration adapters that map inputs and results to declared operations. | Declared domain data, never arbitrary adapter behavior |

No RDF parser should fetch a referenced IRI, authenticate to Microsoft 365,
read a PDF, call an external system, or execute extension content.

## Migration plan and cost

The migration is localized and medium-sized, but it is not part of this
research ticket:

1. Add a production package manifest and lockfile in a separate change with
   the pinned N3 and SHACL adapter versions.
2. Replace the handwritten Turtle parser with strict N3 parsing and use N3's
   writer for graph serialization.
3. Convert the internal graph operations to RDF/JS `Quad`/`DatasetCore`
   operations while keeping `inspectSemanticSource(input)` and the effective
   model's data-only shape stable.
4. Add conformance coverage for the project fixture, Turtle round-trips,
   term equality, dataset matching, blank nodes, typed literals, RDF lists,
   extension preservation, SHACL result normalization, deterministic
   diagnostics, and resource limits.
5. Keep custom Semantic Source verification and effective-model materialization
   after SHACL and before client/execution stages.

The main compatibility risks are blank-node identity assumptions, arbitrary
dataset iteration order, N3's permissive default parser mode, and differences
between the chosen SHACL report objects and Talby's stable diagnostic shape.
They are testable at the existing seam and do not require changing #36.

## Relationship to #37 and #36

This decision does not block integration of #37 at the public boundary. The
current #37 seam already exposes the source snapshot, Declaration Identifier
index, and Module ownership without exposing parser-specific objects. A later
N3/SHACL migration can occur behind that seam.

Issue #36 remains downstream of #37. Its Visual Source binding must consume
the effective model's declaration index and Module ownership and must not parse
the Semantic Source again or import RDF package objects. This preserves the
boundary in [ADR-0009](../adr/0009-vinculo-ejecutable-fuente-visual-modulo.md)
and the source isolation in [ADR-0008](../adr/0008-fuente-visual-anotaciones.md).

The migration is therefore a release-quality follow-up, not a blocker for
implementing the #36 binding seam once #37 is integrated.

## Research acceptance status

- [x] Candidate RDF/JS, parser/serializer, SHACL, and query options compared
      against `PROJECT_SEMANTIC_SOURCE` and the RDF/JS contracts.
- [x] Parsing/serialization, term equality, dataset matching, typed literals,
      RDF lists, blank nodes, extension preservation, and repeated diagnostic
      summaries probed.
- [x] SHACL conformance and the adapter boundary for Talby diagnostics
      documented; the complete project shape catalog remains a migration-test
      responsibility because concrete shapes are not yet in the repository.
- [x] Direct dataset matching chosen for the first delivery; full Comunica
      deferred until SPARQL or federation is required.
- [x] RDF responsibilities separated from local files, Microsoft Graph,
      PDF, authentication, and external-system adapters.
- [x] Versions, licenses, maintenance signals, compatibility, security
      considerations, migration cost, and known limits recorded.
- [x] #37 and #36 impact recorded without changing either implementation.
- [x] No Visual Source implementation, production dependency, prototype, or
      unrelated repository change added by this research.

## Sources

- [RDF/JS Data Model specification](https://rdf.js.org/data-model-spec/)
- [RDF/JS Dataset specification](https://rdf.js.org/dataset-spec/)
- [W3C Turtle 1.1 recommendation](https://www.w3.org/TR/turtle/)
- [W3C SHACL recommendation](https://www.w3.org/TR/shacl/)
- [N3.js official repository](https://github.com/rdfjs/N3.js/)
- [N3.js package metadata](https://github.com/rdfjs/N3.js/blob/main/package.json)
- [rdf-ext official repository](https://github.com/rdf-ext/rdf-ext/)
- [rdf-ext package metadata](https://github.com/rdf-ext/rdf-ext/blob/master/package.json)
- [shacl-engine official repository](https://github.com/rdf-ext/shacl-engine/)
- [shacl-engine package metadata](https://github.com/rdf-ext/shacl-engine/blob/master/package.json)
- [rdf-validate-shacl official package documentation](https://github.com/zazuko/rdf-validate-shacl/tree/master/packages/shacl)
- [rdf-validate-shacl package metadata](https://github.com/zazuko/rdf-validate-shacl/blob/master/packages/shacl/package.json)
- [Comunica query documentation](https://comunica.dev/docs/query/getting_started/query_cli/)
- [Comunica official repository](https://github.com/comunica/comunica/)
- [Node.js filesystem API](https://nodejs.org/api/fs.html)
- [Microsoft Graph `driveItem` API](https://learn.microsoft.com/en-us/graph/api/driveitem-get?view=graph-rest-1.0)
- [Microsoft Graph external content connectors](https://learn.microsoft.com/en-us/graph/connecting-external-content-connectors-api-overview)
- [Mozilla PDF.js](https://mozilla.github.io/pdf.js/)
