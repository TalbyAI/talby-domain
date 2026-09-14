# RDF Ecosystem Evaluation

**Status:** preliminary research; dependency decision pending

**Date:** 2026-09-14

## Question

Should the Contract Layer maintain its own RDF/Turtle parser, graph representation, serialization, validation, and graph operations, or should it use established RDF ecosystem libraries?

## Finding

The current implementation in `src/contract-layer.mjs` owns a bounded Turtle parser and a plain triple representation. That is useful for a first acceptance seam, but it must not become the long-term RDF implementation by accident. The repository already commits to RDF, Turtle, RDF/JS-compatible interoperability, and SHACL as domain decisions; maintaining syntax and graph infrastructure locally would duplicate established work and increase compatibility risk.

There is no single library that should own every capability in the request. RDF libraries cover the RDF data model, serialization, graph datasets, validation, and sometimes query execution. Local files, Microsoft 365 storage, PDF extraction, authentication, and business-system integration are separate adapters.

## Candidate responsibilities

| Capability | Candidate ecosystem | Boundary decision |
| --- | --- | --- |
| RDF terms, quads, and datasets | RDF/JS interfaces with `N3.js` or `rdf-ext` | Keep the domain seam independent of a concrete RDF package. |
| Turtle and related RDF formats | `N3.js` parser/writer | Replace the handwritten syntax parser after conformance checks. |
| Dataset matching and local graph navigation | RDF/JS `DatasetCore` / dataset implementation | Use direct matching for bounded traversal; do not introduce SPARQL for every lookup. |
| SHACL validation | `shacl-engine` and `rdf-validate-shacl` candidates | Compare actual coverage and diagnostics against the approved shapes before selecting one. |
| SPARQL, federation, and heterogeneous sources | Comunica | Evaluate only if the product requires query/federation semantics beyond local dataset matching. |
| Local Windows filesystem | Node `node:fs` and streams | Keep as an I/O adapter, not an RDF concern. |
| OneDrive and SharePoint | Microsoft Graph adapter | Keep credentials, permissions, retries, and Microsoft resource mapping outside the RDF module. |
| PDF compatibility | Dedicated PDF extraction/rendering adapter | Do not make the RDF stack responsible for PDF parsing. |
| External systems | Explicit integration adapters | Map external inputs to declared domain operations; do not let RDF utilities become integration clients. |

## Provisional recommendation

1. Make RDF/JS the internal interoperability seam for terms, quads, and datasets.
2. Evaluate `N3.js` as the first parser/serializer candidate because it supports Turtle, TriG, N-Triples, N-Quads, streaming, and RDF/JS interfaces.
3. Compare `shacl-engine` with `rdf-validate-shacl` against the repository's shapes, required diagnostics, and extension-preservation rules.
4. Treat Comunica as an optional query adapter, not a dependency of the first Contract Layer acceptance path.
5. Preserve `inspectSemanticSource(input)` and the effective-model output as the domain seam. A selected RDF implementation should be replaceable behind that seam, and #36 should consume the effective model rather than RDF package objects.
6. Do not add dependencies or replace the current parser until the research ticket has produced conformance evidence, license/maintenance checks, a migration estimate, and an explicit decision.

## Research-ticket acceptance criteria

- [ ] Compare `N3.js`, `rdf-ext`, `shacl-engine`, and `rdf-validate-shacl` using the project fixture and the required RDF/JS contracts.
- [ ] Verify Turtle parsing/serialization, RDF term equality, dataset matching, blank nodes, typed literals, RDF lists, and extension preservation.
- [ ] Verify SHACL coverage, custom semantic diagnostics, deterministic ordering, and behavior for unsupported or extension predicates.
- [ ] Determine whether a query engine is needed for the first delivery or whether dataset matching is sufficient.
- [ ] Evaluate the adapter boundary for local files, Microsoft Graph/SharePoint/OneDrive, PDF ingestion, and external systems; do not combine those concerns into the RDF package decision.
- [ ] Record package versions, licenses, maintenance signals, browser/Node compatibility, security considerations, and migration cost.
- [ ] Decide whether the selected stack blocks integration of #37 and how it affects the future #36 binding seam.
- [ ] If a package is selected, replace the handwritten RDF infrastructure behind the existing seam with focused conformance tests. If no package is selected, record the explicit reason and the limits of the maintained subset.

## Sources

- [W3C RDF/JS Data Model specification](https://rdf.js.org/data-model-spec/)
- [W3C RDF/JS Dataset specification](https://rdf.js.org/dataset-spec/)
- [W3C Turtle 1.1 Recommendation](https://www.w3.org/TR/turtle/)
- [N3.js official repository and format support](https://github.com/rdfjs/N3.js/)
- [RDF-Ext official repository](https://github.com/rdf-ext/rdf-ext)
- [shacl-engine official repository](https://github.com/rdf-ext/shacl-engine)
- [rdf-validate-shacl official repository](https://github.com/zazuko/rdf-validate-shacl)
- [Comunica official query documentation](https://comunica.dev/docs/query/getting_started/query_cli/)
- [Node.js filesystem API](https://nodejs.org/api/fs.html)
- [Microsoft Graph `driveItem` API](https://learn.microsoft.com/en-us/graph/api/driveitem-get?view=graph-rest-1.0)
- [Microsoft Graph external content connectors](https://learn.microsoft.com/en-us/graph/connecting-external-content-connectors-api-overview)
- [Mozilla PDF.js project](https://mozilla.github.io/pdf.js/)
