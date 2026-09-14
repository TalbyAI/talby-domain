import assert from "node:assert/strict";
import test from "node:test";

import { inspectSemanticSource, loadSemanticSource } from "../src/contract-layer.mjs";

test("materializes a declaration index with its owning Module", () => {
  const result = inspectSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:orders a c:Module ; c:name "Orders" .
    d:order a c:Entity ; c:name "Order" ; c:parent d:orders .
  `);

  assert.equal(result.verification.status, "verified");
  assert.equal(result.effectiveModel.declarationIndex["urn:example:order"].declarationIdentifier, "urn:example:order");
  assert.equal(result.effectiveModel.moduleOwnership["urn:example:order"].ownerModule, "urn:example:orders");
});

test("blocks a Module without a non-empty name", () => {
  const result = inspectSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:orders a c:Module .
  `);

  assert.equal(result.verification.status, "blocked");
  assert.deepEqual(result.verification.diagnostics, [{
    code: "NAME_REQUIRED",
    target: "urn:example:orders"
  }]);
  assert.equal(result.effectiveModel, null);
});

test("requires a named Declaration Identifier for a Module", () => {
  const result = inspectSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    _:orders a c:Module ; c:name "Orders" .
  `);

  assert.equal(result.verification.status, "blocked");
  assert.equal(result.verification.diagnostics[0].code, "DECLARATION_IDENTIFIER_REQUIRED");
  assert.equal(result.effectiveModel, null);
});

test("blocks multiple Module names instead of choosing one", () => {
  const result = inspectSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:orders a c:Module ; c:name "Orders" ; c:name "Sales" .
  `);

  assert.equal(result.verification.status, "blocked");
  assert.deepEqual(result.verification.diagnostics, [{
    code: "NAME_CARDINALITY",
    target: "urn:example:orders"
  }]);
});

test("accepts an explicitly typed RDF string literal", () => {
  const result = inspectSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
    d:orders a c:Module ; c:name "Orders"^^xsd:string .
  `);

  assert.equal(result.verification.status, "verified");
  assert.equal(result.effectiveModel.declarationIndex["urn:example:orders"].name, "Orders");
});

test("requires a name on every organizational declaration", () => {
  const result = inspectSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:orders a c:Module ; c:name "Orders" .
    d:order a c:Entity ; c:parent d:orders .
  `);

  assert.equal(result.verification.status, "blocked");
  assert.deepEqual(result.verification.diagnostics, [{
    code: "NAME_REQUIRED",
    target: "urn:example:order"
  }]);
});

test("requires parent links to use Declaration Identifier IRIs", () => {
  const result = inspectSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:orders a c:Module ; c:name "Orders" .
    d:order a c:Entity ; c:name "Order" ; c:parent "orders" .
  `);

  assert.equal(result.verification.status, "blocked");
  assert.deepEqual(result.verification.diagnostics, [{
    code: "PARENT_IRI_REQUIRED",
    target: "urn:example:order"
  }]);
});

test("treats repeated RDF triples as one graph statement", () => {
  const source = loadSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:orders a c:Module ; c:name "Orders" .
    d:orders c:name "Orders" .
  `);

  assert.equal(source.graph.filter((triple) => triple.predicate.value.endsWith("name")).length, 1);
});

test("returns a separate Semantic Source snapshot without rewriting the input graph", () => {
  const source = loadSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:orders a c:Module ; c:name "Orders" .
  `);
  const before = structuredClone(source.graph);
  const result = inspectSemanticSource(source);

  assert.deepEqual(source.graph, before);
  assert.notEqual(result.effectiveModel.semanticSource, result.source);
});

test("keeps the Declaration Identifier stable through a rename and reorganization", () => {
  const first = inspectSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:one a c:Module ; c:name "One" .
    d:order a c:Entity ; c:name "Order" ; c:parent d:one .
  `).effectiveModel;
  const second = inspectSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:two a c:Module ; c:name "Two" .
    d:orders a c:Feature ; c:name "Orders" ; c:parent d:two .
    d:order a c:Entity ; c:name "Purchase" ; c:parent d:orders .
  `).effectiveModel;

  assert.equal(second.declarationIndex["urn:example:order"].declarationIdentifier, "urn:example:order");
  assert.equal(second.declarationIndex["urn:example:order"].ownerModule, "urn:example:two");
  assert.notEqual(first.declarationIndex["urn:example:order"].name, second.declarationIndex["urn:example:order"].name);
});

test("resolves the Module itself and a nested Feature chain", () => {
  const model = inspectSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:orders a c:Module ; c:name "Orders" .
    d:catalog a c:Feature ; c:name "Catalog" ; c:parent d:orders .
    d:order a c:Entity ; c:name "Order" ; c:parent d:catalog .
  `).effectiveModel;

  assert.equal(model.moduleOwnership["urn:example:orders"].ownerModule, "urn:example:orders");
  assert.equal(model.moduleOwnership["urn:example:catalog"].ownerModule, "urn:example:orders");
  assert.equal(model.moduleOwnership["urn:example:order"].ownerModule, "urn:example:orders");
});

test("preserves zero and multiple Module owners instead of guessing", () => {
  const result = inspectSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:one a c:Module ; c:name "One" .
    d:two a c:Module ; c:name "Two" .
    d:shared a c:Field ; c:parent d:one, d:two .
    d:unowned a c:Field .
  `);

  assert.deepEqual(result.effectiveModel.moduleOwnership["urn:example:shared"], {
    ownerModule: null,
    ownerModules: ["urn:example:one", "urn:example:two"]
  });
  assert.deepEqual(result.effectiveModel.moduleOwnership["urn:example:unowned"], {
    ownerModule: null,
    ownerModules: []
  });
});

test("blocks a parent cycle without returning an effective model", () => {
  const result = inspectSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:orders a c:Module ; c:name "Orders" .
    d:one a c:Feature ; c:name "One" ; c:parent d:two .
    d:two a c:Feature ; c:name "Two" ; c:parent d:one .
  `);

  assert.equal(result.verification.status, "blocked");
  assert.equal(result.verification.diagnostics.some((diagnostic) => diagnostic.code === "PARENT_CYCLE"), true);
  assert.equal(result.effectiveModel, null);
});
