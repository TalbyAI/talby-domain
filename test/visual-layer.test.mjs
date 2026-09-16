import assert from "node:assert/strict";
import test from "node:test";
import { DataFactory, Parser, Store } from "n3";

import { inspectSemanticSource, loadSemanticSource } from "../src/contract-layer.mjs";
import {
  PROJECT_MOCKING_SOURCE,
  PROJECT_SEMANTIC_SOURCE,
  createAcceptanceService
} from "../src/contract-acceptance.mjs";
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

const multiModel = modelFrom([
  "@prefix c: <" + CONTRACT + "> .",
  "@prefix d: <urn:example:> .",
  "d:orders a c:Module ; c:name \"Orders\" .",
  "d:sales a c:Module ; c:name \"Sales\" .",
  "d:order a c:Entity ; c:name \"Order\" ; c:parent d:orders .",
  "d:invoice a c:Entity ; c:name \"Invoice\" ; c:parent d:sales .",
  "d:shared a c:Field ; c:parent d:orders, d:sales .",
  "d:unowned a c:Field ."
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

function multiVisual(entries, module = "d:orders") {
  return [
    "@prefix visual: <" + VISUAL + "> .",
    "@prefix d: <urn:example:> .",
    "@prefix xsd: <" + XSD + "> .",
    "[] a visual:VisualSource ; visual:module " + module + " .",
    entries.map(({ target, suffix = "" }) => target + " visual:x \"1\"^^xsd:decimal ; visual:y \"2\"^^xsd:decimal" + suffix + " .").join("\n")
  ].join("\n");
}

function tripleKey(triple) {
  return JSON.stringify([triple.subject, triple.predicate, triple.object]);
}

test("retains missing, cross-Module, ambiguous, and unowned targets as orphans", () => {
  const result = bindVisualSource(multiVisual([
    { target: "d:unowned" },
    { target: "d:missing", suffix: " ; visual:extension [ <urn:custom:orphan-note> \"preserve\" ]" },
    { target: "d:invoice" },
    { target: "d:shared" },
    { target: "d:order" }
  ]), multiModel);

  assert.equal(result.status, "bound");
  assert.equal(result.selectedModule, "urn:example:orders");
  assert.deepEqual(result.applied.map(({ target }) => target), ["urn:example:order"]);
  assert.deepEqual(result.orphans.map(({ target }) => target), [
    "urn:example:invoice",
    "urn:example:missing",
    "urn:example:shared",
    "urn:example:unowned"
  ]);
  assert.deepEqual(result.diagnostics, [
    {
      severity: "warning",
      code: "VISUAL_TARGET_ORPHAN",
      reason: "cross-module",
      target: "urn:example:invoice",
      selectedModule: "urn:example:orders",
      ownerModule: "urn:example:sales"
    },
    {
      severity: "warning",
      code: "VISUAL_TARGET_ORPHAN",
      reason: "missing-target",
      target: "urn:example:missing",
      selectedModule: "urn:example:orders"
    },
    {
      severity: "warning",
      code: "VISUAL_TARGET_ORPHAN",
      reason: "ambiguous-owner",
      target: "urn:example:shared",
      selectedModule: "urn:example:orders",
      ownerModules: ["urn:example:orders", "urn:example:sales"]
    },
    {
      severity: "warning",
      code: "VISUAL_TARGET_ORPHAN",
      reason: "unowned-target",
      target: "urn:example:unowned",
      selectedModule: "urn:example:orders"
    }
  ]);
  assert.ok(result.orphans[1].triples.some(({ predicate, object }) => predicate.value === "urn:custom:orphan-note" && object.value === "preserve"));
  assert.equal(result.orphans[2].diagnostic.ownerModule, undefined);
  assert.equal(result.orphans[3].diagnostic.ownerModules, undefined);
});

test("accepts Unicode prefixed local names containing BASE and PREFIX", () => {
  const result = bindVisualSource([
    "@prefix visual: <" + VISUAL + "> .",
    "@prefix d: <urn:example:> .",
    "@prefix xsd: <" + XSD + "> .",
    "[] a visual:VisualSource ; visual:module d:orders .",
    "d:éBASE visual:x \"1\"^^xsd:decimal ; visual:y \"2\"^^xsd:decimal .",
    "d:éPREFIX visual:x \"3\"^^xsd:decimal ; visual:y \"4\"^^xsd:decimal ."
  ].join("\n"), model);

  assert.equal(result.status, "bound");
  assert.deepEqual(result.applied, []);
  assert.deepEqual(result.orphans.map(({ target }) => target), [
    "urn:example:éBASE",
    "urn:example:éPREFIX"
  ]);
  assert.deepEqual(result.diagnostics.map(({ reason, target }) => ({ reason, target })), [
    { reason: "missing-target", target: "urn:example:éBASE" },
    { reason: "missing-target", target: "urn:example:éPREFIX" }
  ]);
});

test("blocks malformed effective-model ownership before annotation classification", () => {
  const malformedModel = structuredClone(model);
  malformedModel.moduleOwnership["urn:example:order"].ownerModules = ["urn:example:orders", 42];

  const result = bindVisualSource(visualWith("d:order", "visual:x \"1\"^^xsd:decimal ; visual:y \"2\"^^xsd:decimal"), malformedModel);

  assert.deepEqual(result, {
    status: "blocked",
    selectedModule: null,
    applied: [],
    orphans: [],
    diagnostics: [{ severity: "error", code: "VISUAL_EFFECTIVE_MODEL_INVALID" }]
  });
});

test("keeps a visual annotation attached after semantic rename and reorganization", () => {
  const firstModel = modelFrom([
    "@prefix c: <" + CONTRACT + "> .",
    "@prefix d: <urn:stable:> .",
    "d:one a c:Module ; c:name \"One\" .",
    "d:order a c:Entity ; c:name \"Order\" ; c:parent d:one ."
  ].join("\n"));
  const secondModel = modelFrom([
    "@prefix c: <" + CONTRACT + "> .",
    "@prefix d: <urn:stable:> .",
    "d:two a c:Module ; c:name \"Two\" .",
    "d:group a c:Feature ; c:name \"Orders\" ; c:parent d:two .",
    "d:order a c:Entity ; c:name \"Purchase\" ; c:parent d:group ."
  ].join("\n"));
  const visual = (module) => [
    "@prefix visual: <" + VISUAL + "> .",
    "@prefix d: <urn:stable:> .",
    "@prefix xsd: <" + XSD + "> .",
    "[] a visual:VisualSource ; visual:module " + module + " .",
    "d:order visual:x \"1\"^^xsd:decimal ; visual:y \"2\"^^xsd:decimal ."
  ].join("\n");

  assert.deepEqual(bindVisualSource(visual("d:one"), firstModel).applied.map(({ target }) => target), ["urn:stable:order"]);
  assert.deepEqual(bindVisualSource(visual("d:two"), secondModel).applied.map(({ target }) => target), ["urn:stable:order"]);
});

test("returns the same result for repeated validation and equivalent graph orderings", () => {
  const first = bindVisualSource(multiVisual([
    { target: "d:invoice" },
    { target: "d:order" },
    { target: "d:shared" }
  ]), multiModel);
  const second = bindVisualSource(multiVisual([
    { target: "d:shared" },
    { target: "d:order" },
    { target: "d:invoice" }
  ]), multiModel);
  const third = bindVisualSource(multiVisual([
    { target: "d:invoice" },
    { target: "d:order" },
    { target: "d:shared" }
  ]), multiModel);

  assert.deepEqual(second, first);
  assert.deepEqual(third, first);
});

test("keeps public annotation triples stable across equivalent graph orderings", () => {
  const descriptor = blankNode("descriptor");
  const target = namedNode("urn:example:order");
  const extension = blankNode("extension");
  const graph = [
    quad(descriptor, namedNode(RDF_TYPE), namedNode(VISUAL + "VisualSource")),
    quad(descriptor, namedNode(VISUAL + "module"), namedNode("urn:example:orders")),
    quad(target, namedNode(VISUAL + "y"), literal("2", namedNode(XSD + "decimal"))),
    quad(extension, namedNode("urn:custom:value"), literal("same", "en")),
    quad(target, namedNode(VISUAL + "extension"), extension),
    quad(extension, namedNode("urn:custom:value"), literal("same", namedNode(XSD + "string"))),
    quad(target, namedNode(VISUAL + "x"), literal("1", namedNode(XSD + "decimal")))
  ];

  const first = bindVisualSource(graph, model);
  const second = bindVisualSource([...graph].reverse(), model);

  assert.equal(first.status, "bound");
  assert.deepEqual(second, first);
  assert.deepEqual(first.applied[0].triples.map(({ subject, predicate, object }) => [
    subject.termType,
    subject.value,
    predicate.value,
    object.termType,
    object.value,
    object.datatype ?? null,
    object.language ?? null
  ]), [
    ["BlankNode", "extension", "urn:custom:value", "Literal", "same", "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString", "en"],
    ["BlankNode", "extension", "urn:custom:value", "Literal", "same", XSD + "string", null],
    ["NamedNode", "urn:example:order", VISUAL + "extension", "BlankNode", "extension", null, null],
    ["NamedNode", "urn:example:order", VISUAL + "x", "Literal", "1", XSD + "decimal", null],
    ["NamedNode", "urn:example:order", VISUAL + "y", "Literal", "2", XSD + "decimal", null]
  ]);
});

test("keeps colliding NUL-containing public literal fields stable across graph orderings", () => {
  const nul = String.fromCodePoint(0);
  const descriptor = blankNode("nul-descriptor");
  const target = namedNode("urn:example:order");
  const extension = blankNode("nul-extension");
  const predicate = namedNode("urn:custom:value");
  const graph = [
    quad(descriptor, namedNode(RDF_TYPE), namedNode(VISUAL + "VisualSource")),
    quad(descriptor, namedNode(VISUAL + "module"), namedNode("urn:example:orders")),
    quad(target, namedNode(VISUAL + "extension"), extension),
    quad(extension, predicate, literal("a" + nul + "b", namedNode("urn:datatype:c"))),
    quad(extension, predicate, literal("a", namedNode("b" + nul + "urn:datatype:c")))
  ];

  const first = bindVisualSource(graph, model);
  const second = bindVisualSource([...graph].reverse(), model);

  assert.equal(first.status, "bound");
  assert.deepEqual(second, first);
  assert.deepEqual(first.applied[0].triples.map(({ object }) => [
    object.termType,
    object.value,
    object.datatype,
    object.language
  ]), [
    ["Literal", "a", "b" + nul + "urn:datatype:c", null],
    ["Literal", "a" + nul + "b", "urn:datatype:c", null],
    ["BlankNode", "nul-extension", undefined, undefined]
  ]);
});

test("keeps blocking diagnostics stable across equivalent graph orderings", () => {
  const first = bindVisualSource(visualWith("d:order", '<urn:z> "z" ; <urn:a> "a"'), model);
  const second = bindVisualSource(visualWith("d:order", '<urn:a> "a" ; <urn:z> "z"'), model);

  assert.equal(first.status, "blocked");
  assert.deepEqual(second.diagnostics, first.diagnostics);
  assert.deepEqual(first.diagnostics, [
    {
      severity: "error",
      code: "VISUAL_UNKNOWN_PROPERTY",
      target: "urn:example:order",
      predicate: "urn:a"
    },
    {
      severity: "error",
      code: "VISUAL_UNKNOWN_PROPERTY",
      target: "urn:example:order",
      predicate: "urn:z"
    }
  ]);
});

test("orders non-BMP public targets by Unicode code point across equivalent graph orderings", () => {
  const bmp = String.fromCodePoint(0xe000);
  const nonBmp = String.fromCodePoint(0x1f600);
  const first = bindVisualSource(multiVisual([
    { target: `<urn:example:${nonBmp}>` },
    { target: `<urn:example:${bmp}>` }
  ]), multiModel);
  const second = bindVisualSource(multiVisual([
    { target: `<urn:example:${bmp}>` },
    { target: `<urn:example:${nonBmp}>` }
  ]), multiModel);

  assert.equal(first.status, "bound");
  assert.deepEqual(second.orphans.map(({ target }) => target), first.orphans.map(({ target }) => target));
  assert.deepEqual(first.orphans.map(({ target }) => target), [
    `urn:example:${bmp}`,
    `urn:example:${nonBmp}`
  ]);
});

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

test("normalizes input-controlled iterable errors as invalid graph diagnostics", () => {
  const throwingGraph = (error) => ({
    [Symbol.iterator]() {
      return {
        next() {
          throw error;
        }
      };
    }
  });
  const spoofedLimitError = new Error("input-controlled iterable failure");
  spoofedLimitError.code = "VISUAL_QUAD_COUNT_LIMIT";

  const result = bindVisualSource(throwingGraph(spoofedLimitError), model);

  assert.deepEqual(result, {
    status: "blocked",
    selectedModule: null,
    applied: [],
    orphans: [],
    diagnostics: [{
      severity: "error",
      code: "VISUAL_GRAPH_INVALID",
      detail: "input-controlled iterable failure"
    }]
  });

  const noDetailError = { code: "VISUAL_SOURCE_BYTES_LIMIT" };
  const noDetailResult = bindVisualSource(throwingGraph(noDetailError), model);

  assert.deepEqual(noDetailResult.diagnostics, [{
    severity: "error",
    code: "VISUAL_GRAPH_INVALID"
  }]);
  assert.equal(Object.hasOwn(noDetailResult.diagnostics[0], "detail"), false);
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

test("does not treat a VisualSource-typed extension node as a descriptor", () => {
  const result = bindVisualSource(visualWith("d:order", [
    "visual:extension [",
    "  a visual:VisualSource ;",
    "  visual:x \"not a decimal\" ;",
    "  <urn:custom:note> \"inert\"",
    "]"
  ].join("\n")), model);

  assert.equal(result.status, "bound");
  assert.deepEqual(result.applied.map(({ target }) => target), ["urn:example:order"]);
  assert.deepEqual(result.diagnostics, []);
  const triples = result.applied[0].triples;
  assert.ok(triples.some(({ predicate, object }) => predicate.value === RDF_TYPE && object.value === VISUAL + "VisualSource"));
  assert.ok(triples.some(({ predicate, object }) => predicate.value === VISUAL + "x" && object.value === "not a decimal"));
  assert.ok(triples.some(({ predicate, object }) => predicate.value === "urn:custom:note" && object.value === "inert"));
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

test("validates every duplicate core value independent of graph order", () => {
  const descriptor = blankNode("duplicate-descriptor");
  const target = namedNode("urn:example:order");
  const extension = blankNode("duplicate-extension");
  const decimal = (value) => literal(value, namedNode(XSD + "decimal"));
  const string = (value) => literal(value, namedNode(XSD + "string"));
  const graph = [
    quad(descriptor, namedNode(RDF_TYPE), namedNode(VISUAL + "VisualSource")),
    quad(descriptor, namedNode(VISUAL + "module"), namedNode("urn:example:orders")),
    quad(target, namedNode(VISUAL + "x"), decimal("1")),
    quad(target, namedNode(VISUAL + "x"), string("invalid x")),
    quad(target, namedNode(VISUAL + "y"), decimal("2")),
    quad(target, namedNode(VISUAL + "y"), string("invalid y")),
    quad(target, namedNode(VISUAL + "width"), decimal("10")),
    quad(target, namedNode(VISUAL + "width"), string("invalid width")),
    quad(target, namedNode(VISUAL + "height"), decimal("5")),
    quad(target, namedNode(VISUAL + "height"), string("invalid height")),
    quad(target, namedNode(VISUAL + "fill"), string("#11223344")),
    quad(target, namedNode(VISUAL + "fill"), string("blue")),
    quad(target, namedNode(VISUAL + "stroke"), string("#aabbccdd")),
    quad(target, namedNode(VISUAL + "stroke"), string("blue")),
    quad(target, namedNode(VISUAL + "extension"), extension),
    quad(target, namedNode(VISUAL + "extension"), string("invalid extension")),
    quad(extension, namedNode("urn:custom:note"), string("inert"))
  ];
  const results = [graph, [...graph].reverse()].map((input) => bindVisualSource(input, model));

  assert.equal(results[0].status, "blocked");
  assert.deepEqual(results[1].diagnostics, results[0].diagnostics);
  assert.deepEqual(results[0].diagnostics.map(({ code, predicate }) => ({ code, predicate })), [
    { code: "VISUAL_CARDINALITY_INVALID", predicate: VISUAL + "extension" },
    { code: "VISUAL_EXTENSION_INVALID", predicate: VISUAL + "extension" },
    { code: "VISUAL_CARDINALITY_INVALID", predicate: VISUAL + "fill" },
    { code: "VISUAL_COLOR_INVALID", predicate: VISUAL + "fill" },
    { code: "VISUAL_CARDINALITY_INVALID", predicate: VISUAL + "height" },
    { code: "VISUAL_DECIMAL_INVALID", predicate: VISUAL + "height" },
    { code: "VISUAL_CARDINALITY_INVALID", predicate: VISUAL + "stroke" },
    { code: "VISUAL_COLOR_INVALID", predicate: VISUAL + "stroke" },
    { code: "VISUAL_CARDINALITY_INVALID", predicate: VISUAL + "width" },
    { code: "VISUAL_DECIMAL_INVALID", predicate: VISUAL + "width" },
    { code: "VISUAL_CARDINALITY_INVALID", predicate: VISUAL + "x" },
    { code: "VISUAL_DECIMAL_INVALID", predicate: VISUAL + "x" },
    { code: "VISUAL_CARDINALITY_INVALID", predicate: VISUAL + "y" },
    { code: "VISUAL_DECIMAL_INVALID", predicate: VISUAL + "y" }
  ]);
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

test("keeps the Semantic Source graph, effective model, and execution isolated", () => {
  const service = createAcceptanceService({
    semanticSource: PROJECT_SEMANTIC_SOURCE,
    mockingSource: PROJECT_MOCKING_SOURCE,
    actor: "editor",
    tokenSecret: Buffer.alloc(32, 7)
  });
  const visualSource = loadSemanticSource([
    "@prefix visual: <" + VISUAL + "> .",
    "@prefix d: <urn:talby:contract:> .",
    "@prefix xsd: <" + XSD + "> .",
    "[] a visual:VisualSource ; visual:module d:module .",
    "d:proyecto visual:x \"1\"^^xsd:decimal ; visual:y \"2\"^^xsd:decimal ; visual:fill \"#11223344\" ."
  ].join("\n"));

  try {
    const created = service.client.createProject({
      clienteId: "cliente-1",
      nombre: "Proyecto Atlas",
      periodo: { inicio: "2026-01-01", fin: "2026-12-31" },
      importe: "100.00"
    });
    assert.equal(created.status, 201);

    const graphBefore = structuredClone(visualSource.graph);
    const modelBefore = structuredClone(service.effectiveModel);
    const generatedBefore = service.generatedClientSource;
    const payloadBefore = service.client.getProject("project-1");
    const permissionRequest = {
      method: "POST",
      path: "/projects",
      headers: { "X-Test-Actor": "reader" },
      body: JSON.stringify({
        clienteId: "cliente-1",
        nombre: "Reader Project",
        periodo: { inicio: "2026-01-01", fin: "2026-12-31" },
        importe: "100.00"
      })
    };
    const permissionBefore = service.execute(permissionRequest);
    const mockingBefore = service.client.approveProject("project-1");
    const compatibilityBefore = service.compareCompatibility(service.effectiveModel, service.effectiveModel);
    const runtimeBefore = structuredClone(service.storage());

    const first = bindVisualSource(visualSource, service.effectiveModel);
    const second = bindVisualSource([
      "@prefix visual: <" + VISUAL + "> .",
      "@prefix d: <urn:talby:contract:> .",
      "@prefix xsd: <" + XSD + "> .",
      "[] a visual:VisualSource ; visual:module d:module .",
      "d:proyecto visual:x \"99\"^^xsd:decimal ; visual:y \"100\"^^xsd:decimal ; visual:fill \"#ffeeddcc\" ."
    ].join("\n"), service.effectiveModel);

    assert.equal(first.status, "bound");
    assert.equal(second.status, "bound");
    assert.deepEqual(visualSource.graph, graphBefore);
    assert.deepEqual(service.effectiveModel, modelBefore);
    assert.equal(service.generatedClientSource, generatedBefore);
    assert.deepEqual(service.client.getProject("project-1"), payloadBefore);
    assert.deepEqual(service.storage(), runtimeBefore);
    assert.deepEqual(service.execute(permissionRequest), permissionBefore);
    assert.deepEqual(service.client.approveProject("project-1"), mockingBefore);
    assert.deepEqual(service.compareCompatibility(service.effectiveModel, service.effectiveModel), compatibilityBefore);
  } finally {
    service.close();
  }
});

test("does not dereference external extension IRIs or execute extension literals", () => {
  const marker = "__visual_extension_marker__";
  const previousFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => { fetchCalls += 1; };
  globalThis[marker] = 0;

  try {
    const result = bindVisualSource([
      "@prefix visual: <" + VISUAL + "> .",
      "@prefix d: <urn:example:> .",
      "@prefix xsd: <" + XSD + "> .",
      "[] a visual:VisualSource ; visual:module d:orders .",
      "d:order visual:x \"1\"^^xsd:decimal ; visual:y \"2\"^^xsd:decimal ; visual:extension d:extension .",
      "d:extension <https://assets.invalid/layout.json> <https://assets.invalid/layout.json> ;",
      "  <urn:custom:script> \"globalThis.__visual_extension_marker__ = 1\" ."
    ].join("\n"), model);

    assert.equal(result.status, "bound");
    assert.equal(fetchCalls, 0);
    assert.equal(globalThis[marker], 0);
  } finally {
    globalThis.fetch = previousFetch;
    delete globalThis[marker];
  }
});
