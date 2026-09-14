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
