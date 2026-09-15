import assert from "node:assert/strict";
import test from "node:test";
import { Parser, Store } from "n3";

import { validateShaclDataset } from "../src/shacl-adapter.mjs";

import {
  inspectSemanticSource,
  loadSemanticSource,
  matchSemanticSource,
  serializeSemanticSource,
  validateSemanticSource
} from "../src/contract-layer.mjs";

test("round-trips Turtle through RDF/JS without exposing package objects", async () => {
  const turtle = `
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
    d:orders a c:Module ; c:name "Orders" ; c:extension [ <urn:custom:color> "blue" ] .
    d:orders c:limit 1.50 ; c:normalizers ( c:trim ) .
    d:amount c:value "1.50"^^xsd:decimal .
  `;

  const source = loadSemanticSource(turtle);
  const serialized = await serializeSemanticSource(source);
  const roundTrip = loadSemanticSource(serialized);
  const result = inspectSemanticSource(turtle);
  const matches = matchSemanticSource(roundTrip, { subject: "urn:example:orders", predicate: "https://github.com/TalbyAI/talby-domain/vocab/contract#name" });

  assert.equal(roundTrip.graph.length, source.graph.length);
  assert.equal(matches[0].object.value, "Orders");
  assert.equal(result.source.graph[0].subject.equals, undefined);
  assert.equal(result.source.graph[0].predicate.equals, undefined);
  assert.doesNotThrow(() => structuredClone(result));
});

test("preserves RDF/JS language literals at the data-only boundary", () => {
  const source = loadSemanticSource({
    raw: null,
    graph: [{
      subject: { termType: "NamedNode", value: "urn:example:subject" },
      predicate: { termType: "NamedNode", value: "urn:example:label" },
      object: {
        termType: "Literal",
        value: "Pedidos",
        datatype: "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString",
        language: "es"
      }
    }]
  });

  assert.deepEqual(source.graph[0].object, {
    termType: "Literal",
    value: "Pedidos",
    datatype: "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString",
    language: "es"
  });
});

test("rejects SPARQL directives and RDF-star syntax as non-Turtle", () => {
  const inputs = [
    "PREFIX ex: <urn:example:> ex:s ex:p ex:o .",
    "BASE <urn:example:> <s> <p> <o> .",
    "@prefix ex: <urn:example:> . ex:s ex:p << ex:s ex:q ex:o >> ."
  ];

  for (const input of inputs) {
    const result = inspectSemanticSource(input);

    assert.equal(result.verification.status, "blocked");
    assert.equal(result.verification.diagnostics[0].code, "SOURCE_SYNTAX_INVALID");
    assert.deepEqual(result.source.graph, []);
  }
});

test("blocks Turtle input over the source byte ceiling", () => {
  const oversized = "@prefix d: <urn:example:> . d:x <urn:p> \"" + "x".repeat(1_048_576) + "\" .";
  const result = inspectSemanticSource(oversized);
  assert.equal(result.verification.status, "blocked");
  assert.equal(result.verification.diagnostics[0].code, "SOURCE_BYTES_LIMIT");
  assert.equal(result.effectiveModel, null);
});

test("blocks a graph over the quad ceiling before verification", () => {
  const graph = Array.from({ length: 10_001 }, (_, index) => ({
    subject: { termType: "NamedNode", value: "urn:s:" + index },
    predicate: { termType: "NamedNode", value: "urn:p" },
    object: { termType: "Literal", value: "x", datatype: "http://www.w3.org/2001/XMLSchema#string", language: null }
  }));
  const result = inspectSemanticSource({ graph });
  assert.equal(result.verification.diagnostics[0].code, "QUAD_COUNT_LIMIT");
});

test("preserves Turtle prefixed names containing directive words", () => {
  const source = loadSemanticSource(`
    @prefix d: <urn:example:> .
    d:foo.BASE d:p d:o .
  `);

  assert.equal(source.graph[0].subject.value, "urn:example:foo.BASE");
});

test("preserves escaped punctuation in Turtle local names", () => {
  for (const escaped of ["!", "~", "(", ")", "*", "+", ",", ";", "=", "/", "?"]) {
    const source = loadSemanticSource(`@prefix d: <urn:> . d:foo\\${escaped}BASE <urn:p> <urn:o> .`);

    assert.equal(source.graph[0].subject.value, `urn:foo${escaped}BASE`);
  }
});

test("parses bare decimal literals while preserving statement punctuation", () => {
  const source = loadSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:project c:limit 1.5 .
  `);

  assert.deepEqual(source.graph.find(({ predicate }) => predicate.value.endsWith("#limit")).object, {
    termType: "Literal",
    value: "1.5",
    datatype: "http://www.w3.org/2001/XMLSchema#decimal",
    language: null
  });
});

test("sorts diagnostics by code and target without locale rules", () => {
  const result = inspectSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:A c:unknown "uppercase" .
    d:a c:unknown "lowercase" .
  `);

  assert.deepEqual(result.verification.diagnostics.map(({ target }) => target), ["urn:example:A", "urn:example:a"]);
});

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

test("resolves a BusinessError through its declared Module", () => {
  const model = inspectSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:orders a c:Module ; c:name "Orders" .
    d:cannot-approve a c:BusinessError ; c:module d:orders ; c:code "CANNOT_APPROVE" .
  `).effectiveModel;

  assert.equal(model.moduleOwnership["urn:example:cannot-approve"].ownerModule, "urn:example:orders");
});

test("blocks a BusinessError without exactly one Module", () => {
  const result = inspectSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:orders a c:Module ; c:name "Orders" .
    d:cannot-approve a c:BusinessError ; c:code "CANNOT_APPROVE" .
  `);

  assert.equal(result.verification.status, "blocked");
  assert.deepEqual(result.verification.diagnostics, [{
    code: "BUSINESS_ERROR_MODULE_REQUIRED",
    target: "urn:example:cannot-approve"
  }]);
});

test("rejects an unknown Semantic Source predicate", () => {
  const result = inspectSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:orders a c:Module ; c:name "Orders" ; c:unknown "not allowed" .
  `);

  assert.equal(result.verification.status, "blocked");
  assert.deepEqual(result.verification.diagnostics, [{
    code: "UNKNOWN_PROPERTY",
    predicate: "https://github.com/TalbyAI/talby-domain/vocab/contract#unknown",
    target: "urn:example:orders"
  }]);
});

test("preserves unknown RDF below an explicit Semantic Source extension", () => {
  const result = inspectSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:orders a c:Module ; c:name "Orders" ; c:extension [ <urn:custom:color> "blue" ] .
  `);

  assert.equal(result.verification.status, "verified");
  assert.equal(result.effectiveModel.declarationIndex["urn:example:orders"].ownerModule, "urn:example:orders");
  assert.ok(result.source.graph.some(({ predicate }) => predicate.value === "urn:custom:color"));
});

test("requires exactly one parent for an organizational declaration", () => {
  const result = inspectSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:one a c:Module ; c:name "One" .
    d:two a c:Module ; c:name "Two" .
    d:order a c:Entity ; c:name "Order" ; c:parent d:one, d:two .
  `);

  assert.equal(result.verification.status, "blocked");
  assert.deepEqual(result.verification.diagnostics, [{
    code: "PARENT_CARDINALITY",
    target: "urn:example:order"
  }]);
});

test("blocks a BusinessError whose Module reference is missing", () => {
  const result = inspectSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:cannot-approve a c:BusinessError ; c:module d:missing ; c:code "CANNOT_APPROVE" .
  `);

  assert.equal(result.verification.status, "blocked");
  assert.deepEqual(result.verification.diagnostics, [{
    code: "MODULE_NOT_FOUND",
    parent: "urn:example:missing",
    target: "urn:example:cannot-approve"
  }]);
});

test("marks source declarations as declared in the effective model", () => {
  const model = inspectSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:orders a c:Module ; c:name "Orders" .
  `).effectiveModel;

  assert.equal(model.declarationIndex["urn:example:orders"].origin, "declared");
  assert.equal(model.origins["urn:example:orders"], "declared");
});

test("normalizes deterministic SHACL diagnostics without exposing the report", async () => {
  const data = loadSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:orders a c:Module .
  `);
  const shapes = `
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    d:moduleShape a sh:NodeShape ;
      sh:targetClass c:Module ;
      sh:property [ sh:path c:name ; sh:minCount 1 ] .
  `;

  const first = await validateSemanticSource(data, shapes);
  const second = await validateSemanticSource(data, shapes);

  assert.equal(first.conforms, false);
  assert.equal(first.diagnostics.length, 1);
  assert.equal(first.diagnostics[0].code, "SHACL_MIN_COUNT");
  assert.equal(first.diagnostics[0].target, "urn:example:orders");
  assert.deepEqual(second, first);
  assert.equal(first.dataset, undefined);
  assert.equal(first.results, undefined);
});

test("accepts a conforming synthetic SHACL dataset", async () => {
  const data = loadSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:orders a c:Module ; c:name "Orders" .
  `);
  const shapes = `
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    d:moduleShape a sh:NodeShape ;
      sh:targetClass c:Module ;
      sh:property [ sh:path c:name ; sh:minCount 1 ] .
  `;

  assert.deepEqual(await validateSemanticSource(data, shapes), { conforms: true, diagnostics: [] });
});

test("reports unsupported SHACL paths without guessing a pointer", async () => {
  const data = loadSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:orders a c:Module .
  `);
  const shapes = `
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    d:moduleShape a sh:NodeShape ;
      sh:targetClass c:Module ;
      sh:property [ sh:path [ sh:alternativePath ( c:name c:label ) ] ; sh:minCount 1 ] .
  `;

  const result = await validateSemanticSource(data, shapes);

  assert.equal(result.conforms, false);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].code, "SHACL_PATH_UNSUPPORTED");
  assert.deepEqual(result.diagnostics[0].paths, []);
});

test("does not infer SHACL targets through rdfs:subClassOf", async () => {
  const data = loadSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
    d:direct a c:Module .
    d:special a c:SpecialModule .
    c:SpecialModule rdfs:subClassOf c:Module .
  `);
  const shapes = `
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    d:moduleShape a sh:NodeShape ;
      sh:targetClass c:Module ;
      sh:property [ sh:path c:name ; sh:minCount 1 ] .
  `;

  const result = await validateSemanticSource(data, shapes);

  assert.equal(result.conforms, false);
  assert.equal(result.diagnostics[0].code, "SHACL_MIN_COUNT");
  assert.deepEqual(result.diagnostics.map(({ target }) => target), ["urn:example:direct"]);
  assert.equal(matchSemanticSource(data, { predicate: "http://www.w3.org/2000/01/rdf-schema#subClassOf" }).length, 1);
});

test("returns a data-only diagnostic when SHACL imports are forbidden", async () => {
  const data = loadSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:orders a c:Module .
  `);
  const shapes = `
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    @prefix owl: <http://www.w3.org/2002/07/owl#> .
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    d:moduleShape a sh:NodeShape ;
      sh:targetClass c:Module ;
      owl:imports <urn:remote:shapes> .
  `;

  assert.deepEqual(await validateSemanticSource(data, shapes), {
    conforms: false,
    diagnostics: [{ code: "SHACL_IMPORT_FORBIDDEN", rule: "", target: "", paths: [], detail: "" }]
  });
});

test("returns a data-only diagnostic when SHACL diagnostics exceed the ceiling", async () => {
  const data = loadSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    ${Array.from({ length: 1_001 }, (_, index) => `d:module${index} a c:Module .`).join("\n    ")}
  `);
  const shapes = `
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    d:moduleShape a sh:NodeShape ;
      sh:targetClass c:Module ;
      sh:property [ sh:path c:name ; sh:minCount 1 ] .
  `;

  assert.deepEqual(await validateSemanticSource(data, shapes), {
    conforms: false,
    diagnostics: [{ code: "SHACL_DIAGNOSTIC_LIMIT", rule: "", target: "", paths: [], detail: "" }]
  });
});

test("caps direct SHACL validation when maxDiagnostics is Infinity", async () => {
  const parse = (source) => new Store(new Parser({ format: "text/turtle" }).parse(source));
  const data = parse(`
    @prefix d: <urn:example:> .
    ${Array.from({ length: 1_001 }, (_, index) => `d:module${index} d:value "invalid" .`).join("\n    ")}
  `);
  const shapes = parse(`
    @prefix d: <urn:example:> .
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    d:moduleShape a sh:NodeShape ;
      sh:targetSubjectsOf d:value ;
      sh:property [ sh:path d:value ; sh:in ( "allowed" ) ] .
  `);

  const result = await validateShaclDataset(data, shapes, { maxDiagnostics: Infinity });

  assert.deepEqual(result, {
    conforms: false,
    diagnostics: [{ code: "SHACL_DIAGNOSTIC_LIMIT", rule: "", target: "", paths: [], detail: "" }]
  });
});

test("enforces the configured SHACL diagnostic count limit", async () => {
  const parse = (source) => new Store(new Parser({ format: "text/turtle" }).parse(source));
  const data = parse(`
    @prefix d: <urn:example:> .
    d:one d:value "invalid" .
    d:two d:value "invalid" .
  `);
  const shapes = parse(`
    @prefix d: <urn:example:> .
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    d:valueShape a sh:NodeShape ;
      sh:targetSubjectsOf d:value ;
      sh:property [ sh:path d:value ; sh:in ( "allowed" ) ] .
  `);

  for (const maxDiagnostics of [1, 0]) {
    assert.deepEqual(await validateShaclDataset(data, shapes, { maxDiagnostics }), {
      conforms: false,
      diagnostics: [{ code: "SHACL_DIAGNOSTIC_LIMIT", rule: "", target: "", paths: [], detail: "" }]
    });
  }
});

test("rejects an oversized normalized SHACL diagnostic detail", async () => {
  const data = loadSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:orders a c:Module .
  `);
  const message = "é".repeat(8_193);
  const shapes = `
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    d:moduleShape a sh:NodeShape ;
      sh:targetClass c:Module ;
      sh:property [ sh:path c:name ; sh:minCount 1 ; sh:message "${message}" ] .
  `;

  assert.deepEqual(await validateSemanticSource(data, shapes), {
    conforms: false,
    diagnostics: [{ code: "SHACL_DIAGNOSTIC_LIMIT", rule: "", target: "", paths: [], detail: "" }]
  });
});

test("rejects normalized SHACL diagnostics that exceed the total output limit", async () => {
  const data = loadSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    ${Array.from({ length: 1_000 }, (_, index) => `d:module${index} a c:Module .`).join("\n    ")}
  `);
  const message = "x".repeat(2_048);
  const shapes = `
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    d:moduleShape a sh:NodeShape ;
      sh:targetClass c:Module ;
      sh:property [ sh:path c:name ; sh:minCount 1 ; sh:message "${message}" ] .
  `;

  assert.deepEqual(await validateSemanticSource(data, shapes), {
    conforms: false,
    diagnostics: [{ code: "SHACL_DIAGNOSTIC_LIMIT", rule: "", target: "", paths: [], detail: "" }]
  });
});

test("validates an explicit rdfs:subClassOf property path without inference", async () => {
  const data = loadSemanticSource(`
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
    d:orders a c:Module ; rdfs:subClassOf d:base .
  `);
  const shapes = `
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    d:moduleShape a sh:NodeShape ;
      sh:targetClass c:Module ;
      sh:property [ sh:path rdfs:subClassOf ; sh:minCount 1 ] .
  `;

  assert.deepEqual(await validateSemanticSource(data, shapes), { conforms: true, diagnostics: [] });
});
