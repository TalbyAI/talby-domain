import assert from "node:assert/strict";
import test from "node:test";
import { DataFactory, Parser, Store } from "n3";

import { inspectSemanticSource, loadSemanticSource } from "../src/contract-layer.mjs";
import { bindVisualSource } from "../src/visual-layer.mjs";

const CONTRACT = "https://github.com/TalbyAI/talby-domain/vocab/contract#";
const VISUAL = "https://github.com/TalbyAI/talby-domain/vocab/visual#";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
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
