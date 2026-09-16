import assert from "node:assert/strict";
import test from "node:test";
import { DataFactory, Parser, Store } from "n3";

import { inspectSemanticSource, loadSemanticSource } from "../src/contract-layer.mjs";
import { bindVisualSource } from "../src/visual-layer.mjs";

const CONTRACT = "https://github.com/TalbyAI/talby-domain/vocab/contract#";
const VISUAL = "https://github.com/TalbyAI/talby-domain/vocab/visual#";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const { blankNode, defaultGraph, literal, namedNode, quad } = DataFactory;

function modelFrom(turtle) {
  const result = inspectSemanticSource(turtle);
  assert.equal(result.verification.status, "verified");
  return result.effectiveModel;
}

const model = modelFrom([
  "@prefix c: <" + CONTRACT + "> .",
  "@prefix d: <urn:example:> .",
  "d:orders a c:Module ; c:name \"Orders\" .",
  "d:order a c:Entity ; c:name \"Order\" ; c:parent d:orders ."
].join("\n"));

const emptyVisual = [
  "@prefix visual: <" + VISUAL + "> .",
  "@prefix d: <urn:example:> .",
  "[] a visual:VisualSource ; visual:module d:orders ."
].join("\n");

function visualWith(target, body) {
  return [
    "@prefix visual: <" + VISUAL + "> .",
    "@prefix d: <urn:example:> .",
    "@prefix xsd: <" + XSD + "> .",
    "[] a visual:VisualSource ; visual:module d:orders .",
    target + " " + body + " ."
  ].join("\n");
}

function tripleKey(triple) {
  return JSON.stringify([triple.subject, triple.predicate, triple.object]);
}

test("accepts Turtle, a loaded source, { graph }, and an iterable RDF/JS graph", () => {
  const loaded = loadSemanticSource(emptyVisual);
  const rdfDataset = new Store(new Parser({ format: "text/turtle" }).parse(emptyVisual));
  const inputs = [emptyVisual, loaded, { graph: loaded.graph }, rdfDataset];

  for (const input of inputs) {
    assert.deepEqual(bindVisualSource(input, model), {
      status: "bound",
      selectedModule: "urn:example:orders",
      applied: [],
      orphans: [],
      diagnostics: []
    });
  }
});

test("blocks an invalid descriptor or Module binding without a partial result", () => {
  const cases = [
    ["missing descriptor", [
      "@prefix visual: <" + VISUAL + "> . @prefix d: <urn:example:> .",
      "d:order visual:x \"1\" ."
    ].join("\n"), "VISUAL_SOURCE_DESCRIPTOR_REQUIRED"],
    ["multiple descriptors", [
      "@prefix visual: <" + VISUAL + "> . @prefix d: <urn:example:> .",
      "[] a visual:VisualSource ; visual:module d:orders .",
      "[] a visual:VisualSource ; visual:module d:orders ."
    ].join("\n"), "VISUAL_SOURCE_DESCRIPTOR_CARDINALITY"],
    ["missing module", [
      "@prefix visual: <" + VISUAL + "> .",
      "[] a visual:VisualSource ."
    ].join("\n"), "VISUAL_MODULE_REQUIRED"],
    ["multiple modules", [
      "@prefix visual: <" + VISUAL + "> . @prefix d: <urn:example:> .",
      "[] a visual:VisualSource ; visual:module d:orders, d:order ."
    ].join("\n"), "VISUAL_MODULE_CARDINALITY"],
    ["unknown module", [
      "@prefix visual: <" + VISUAL + "> . @prefix d: <urn:example:> .",
      "[] a visual:VisualSource ; visual:module d:missing ."
    ].join("\n"), "VISUAL_MODULE_NOT_FOUND"],
    ["non-Module binding", [
      "@prefix visual: <" + VISUAL + "> . @prefix d: <urn:example:> .",
      "[] a visual:VisualSource ; visual:module d:order ."
    ].join("\n"), "VISUAL_MODULE_NOT_MODULE"]
  ];

  for (const [name, source, code] of cases) {
    const result = bindVisualSource(source, model);
    assert.equal(result.status, "blocked", name);
    assert.equal(result.selectedModule, null, name);
    assert.deepEqual(result.applied, [], name);
    assert.deepEqual(result.orphans, [], name);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === code), name);
  }
});

test("stops an iterable graph at the quad limit", () => {
  const value = quad(
    namedNode("urn:example:subject"),
    namedNode(VISUAL + "value"),
    literal("1"),
    defaultGraph()
  );
  let nextCalls = 0;
  const graph = {
    [Symbol.iterator]() {
      return {
        next() {
          nextCalls += 1;
          if (nextCalls > 10_001) throw new Error("iterated past visual graph limit");
          return { done: false, value };
        }
      };
    }
  };

  const result = bindVisualSource({ graph }, model);

  assert.equal(result.status, "blocked");
  assert.equal(result.diagnostics[0]?.code, "VISUAL_QUAD_COUNT_LIMIT");
  assert.equal(nextCalls, 10_001);
});

test("rejects DefaultGraph in RDF triple positions but accepts it as the quad graph", () => {
  const predicate = namedNode(VISUAL + "value");
  const subject = namedNode("urn:example:subject");
  const object = literal("1");
  const descriptor = blankNode("descriptor");
  const validQuads = [
    quad(descriptor, namedNode(RDF_TYPE), namedNode(VISUAL + "VisualSource"), defaultGraph()),
    quad(descriptor, namedNode(VISUAL + "module"), namedNode("urn:example:orders"), defaultGraph())
  ];
  const invalid = [
    ["subject", quad(defaultGraph(), predicate, object, defaultGraph())],
    ["object", quad(subject, predicate, defaultGraph(), defaultGraph())]
  ];

  for (const [position, value] of invalid) {
    const result = bindVisualSource([...validQuads, value], model);
    assert.equal(result.status, "blocked", position);
    assert.equal(result.diagnostics[0]?.code, "VISUAL_GRAPH_INVALID", position);
    assert.match(result.diagnostics[0]?.detail ?? "", /Invalid RDF triple positions/, position);
  }

  const result = bindVisualSource(validQuads, model);

  assert.equal(result.status, "bound");
  assert.equal(result.selectedModule, "urn:example:orders");
});

test("applies a valid annotation and preserves its extension closure as data", () => {
  const result = bindVisualSource(visualWith("d:order", [
    "visual:x \"1.25\"^^xsd:decimal ;",
    "visual:y \"-2\"^^xsd:decimal ;",
    "visual:width \"10\"^^xsd:decimal ;",
    "visual:height \"5\"^^xsd:decimal ;",
    "visual:fill \"#11223344\" ;",
    "visual:stroke \"#aabbccdd\" ;",
    "visual:extension [",
    "  <urn:custom:note> \"preserve me\" ;",
    "  <https://assets.invalid/example.svg> \"external data, not a request\"",
    "]"
  ].join("\n")), model);

  assert.equal(result.status, "bound");
  assert.deepEqual(result.applied.map(({ target }) => target), ["urn:example:order"]);
  assert.deepEqual(result.orphans, []);
  assert.deepEqual(result.diagnostics, []);
  const triples = result.applied[0].triples;
  assert.equal(new Set(triples.map(tripleKey)).size, 9);
  assert.deepEqual(new Set(triples.map(({ predicate }) => predicate.value)), new Set([
    VISUAL + "x", VISUAL + "y", VISUAL + "width", VISUAL + "height",
    VISUAL + "fill", VISUAL + "stroke", VISUAL + "extension",
    "urn:custom:note", "https://assets.invalid/example.svg"
  ]));
  assert.ok(triples.every((triple) => triple.subject.equals === undefined && triple.object.equals === undefined));
});

test("blocks invalid core data and never returns a partial annotation result", () => {
  const cases = [
    ["unknown predicate", "visual:bogus \"x\"", "VISUAL_UNKNOWN_PROPERTY"],
    ["duplicate coordinate", "visual:x \"1\"^^xsd:decimal ; visual:x \"2\"^^xsd:decimal ; visual:y \"3\"^^xsd:decimal", "VISUAL_CARDINALITY_INVALID"],
    ["unpaired coordinate", "visual:x \"1\"^^xsd:decimal", "VISUAL_COORDINATE_PAIR_INVALID"],
    ["unpaired dimension", "visual:width \"1\"^^xsd:decimal", "VISUAL_DIMENSION_PAIR_INVALID"],
    ["invalid decimal", "visual:x \"INF\"^^xsd:decimal ; visual:y \"1\"^^xsd:decimal", "VISUAL_DECIMAL_INVALID"],
    ["negative dimension", "visual:width \"-1\"^^xsd:decimal ; visual:height \"1\"^^xsd:decimal", "VISUAL_DIMENSION_NEGATIVE"],
    ["invalid color", "visual:fill \"blue\"", "VISUAL_COLOR_INVALID"],
    ["invalid extension link", "visual:extension \"not a node\"", "VISUAL_EXTENSION_INVALID"]
  ];

  for (const [name, body, code] of cases) {
    const result = bindVisualSource(visualWith("d:order", body), model);
    assert.equal(result.status, "blocked", name);
    assert.equal(result.selectedModule, "urn:example:orders", name);
    assert.deepEqual(result.applied, [], name);
    assert.deepEqual(result.orphans, [], name);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === code), name);
  }
});

test("requires annotation subjects to be Declaration Identifier IRIs", () => {
  const result = bindVisualSource(visualWith("_:visualNode", [
    "visual:x \"1\"^^xsd:decimal ; visual:y \"2\"^^xsd:decimal"
  ].join("\n")), model);

  assert.equal(result.status, "blocked");
  assert.equal(result.diagnostics[0].code, "VISUAL_TARGET_IRI_REQUIRED");
  assert.deepEqual(result.applied, []);
  assert.deepEqual(result.orphans, []);
});

test("keeps the Visual Source descriptor closed", () => {
  const cases = [
    [
      "@prefix visual: <" + VISUAL + "> .",
      "@prefix d: <urn:example:> .",
      "[] a visual:VisualSource ; visual:module d:orders ; visual:fill \"#11223344\" ."
    ].join("\n"),
    [
      "@prefix visual: <" + VISUAL + "> .",
      "@prefix d: <urn:example:> .",
      "[] a visual:VisualSource, visual:OtherDescriptor ; visual:module d:orders ."
    ].join("\n")
  ];
  const codes = ["VISUAL_UNKNOWN_PROPERTY", "VISUAL_DESCRIPTOR_TYPE_INVALID"];

  for (const [index, source] of cases.entries()) {
    const result = bindVisualSource(source, model);
    assert.equal(result.status, "blocked");
    assert.equal(result.diagnostics[0].code, codes[index]);
    assert.deepEqual(result.applied, []);
    assert.deepEqual(result.orphans, []);
  }
});

test("rejects malformed Turtle and named RDF graphs as blocking graph errors", () => {
  const malformed = bindVisualSource("not Turtle", model);
  assert.equal(malformed.status, "blocked");
  assert.equal(malformed.diagnostics[0].code, "VISUAL_GRAPH_INVALID");

  for (const source of [
    "PREFIX ex: <urn:example:> ex:s ex:p ex:o .",
    "BASE <urn:example:> <s> <p> <o> .",
    "@prefix ex: <urn:example:> . ex:s ex:p << ex:s ex:q ex:o >> ."
  ]) {
    const result = bindVisualSource(source, model);
    assert.equal(result.status, "blocked");
    assert.equal(result.diagnostics[0].code, "VISUAL_GRAPH_INVALID");
  }

  const { quad, namedNode, literal } = DataFactory;
  const oversized = "@prefix d: <urn:example:> . d:s <urn:p> \"" + "x".repeat(1_048_576) + "\" .";
  assert.equal(bindVisualSource(oversized, model).diagnostics[0].code, "VISUAL_SOURCE_BYTES_LIMIT");

  const tooManyQuads = new Store(Array.from({ length: 10_001 }, (_, index) => quad(
    namedNode("urn:example:s" + index),
    namedNode("urn:example:p"),
    literal("x")
  )));
  assert.equal(bindVisualSource(tooManyQuads, model).diagnostics[0].code, "VISUAL_QUAD_COUNT_LIMIT");

  const namedGraph = new Store([quad(
    namedNode("urn:example:order"),
    namedNode(VISUAL + "x"),
    literal("1"),
    namedNode("urn:example:graph")
  )]);
  const result = bindVisualSource(namedGraph, model);
  assert.equal(result.status, "blocked");
  assert.equal(result.diagnostics[0].code, "VISUAL_GRAPH_INVALID");
  assert.deepEqual(result.applied, []);
  assert.deepEqual(result.orphans, []);
});
