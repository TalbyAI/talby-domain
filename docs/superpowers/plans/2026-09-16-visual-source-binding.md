# Visual Source–Module Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the standalone bindVisualSource(visualSourceGraph, effectiveSemanticModel) operation that validates a Visual Source, binds it to one loaded Module, preserves inert annotation data, and classifies invalid targets as deterministic orphans.

**Architecture:** src/visual-layer.mjs owns only Visual Source RDF normalization, closed-core validation, extension preservation, and binding against the already-materialized declarationIndex and moduleOwnership maps. It uses the existing N3/RDF/JS boundary for data-only triples but never calls Semantic Source verification, effective-model materialization, the acceptance service, a network loader, a layout engine, or an evaluator. test/visual-layer.test.mjs exercises the public function through Turtle, loaded-source, { graph }, and iterable RDF/JS inputs and proves semantic execution remains isolated.

**Tech Stack:** Node.js ECMAScript modules with Node >=22.5.0, existing n3 2.7.12, and the built-in node:test/node:assert modules; no new runtime dependency.

## Global Constraints

- Add one standalone public operation: bindVisualSource(visualSourceGraph, effectiveSemanticModel) -> visualBindingResult.
- The operation lives in src/visual-layer.mjs.
- It consumes the existing effective model's declarationIndex and moduleOwnership; it does not load, verify, or materialize a Semantic Source.
- The Contract Layer acceptance service remains unchanged and never consumes Visual Source data.
- visualSourceGraph uses the existing RDF/Turtle boundary: Turtle text, a loaded source, a { graph } value, or an iterable RDF/JS graph.
- It is normalized into data-only triples.
- Use the existing source ceilings: 1 MiB of UTF-8 Turtle input and 10,000 parsed quads; callers cannot disable them.
- Reject permissive SPARQL directives and RDF-star syntax at the Turtle boundary.
- No IRI is dereferenced and no executable or layout behavior is introduced.
- The result is a new value and never a rewritten graph.
- A blocked result has no applied or orphan annotations.
- Valid same-Module annotations remain applied when other annotations are orphaned.
- Annotations and diagnostics are sorted by stable target and reason.
- Semantic, Visual, and Mocking Sources remain separate; do not add a Visual Editor, renderer, layout algorithm, multiple views, connectors, external assets, themes, interaction, source versioning, visual compatibility, or a second semantic identity.
- Human-readable production comments, tests, and plan text are written in English; protected RDF IRIs, JSON keys, route literals, and protocol literals keep their exact spelling.
- Do not modify src/contract-layer.mjs, src/contract-acceptance.mjs, src/shacl-adapter.mjs, existing tests, package.json, package-lock.json, samples/, or prototypes/ for this feature.

## File Map

- Create src/visual-layer.mjs: data-only Visual Source graph normalization, descriptor and core-shape validation, extension-closure copying, Module binding, and orphan classification.
- Create test/visual-layer.test.mjs: focused public-boundary conformance tests, including an effective-model fixture built through the existing Contract Layer and an execution-isolation fixture built through the existing acceptance service.
- No other implementation or documentation file changes are part of this plan.

## Public Contract

The module exports exactly one operation:

~~~js
export function bindVisualSource(visualSourceGraph, effectiveSemanticModel) {
  // returns the result shape below
}
~~~

The input accepts these equivalent forms:

~~~text
string Turtle
loaded source with a .graph iterable of data-only triples
{ graph: Iterable<RDF/JS Quad | PublicTriple> }
Iterable<RDF/JS Quad | PublicTriple>
~~~

PublicTriple is the repository's data-only shape:

~~~js
{
  subject: { termType: "NamedNode" | "BlankNode", value: string },
  predicate: { termType: "NamedNode", value: string },
  object: {
    termType: "NamedNode" | "BlankNode" | "Literal",
    value: string,
    datatype: string,
    language: string | null
  }
}
~~~

The effective-model seam consumed by the operation is:

~~~js
{
  declarationIndex: {
    [declarationIdentifier]: {
      declarationIdentifier: string,
      kind: string
    }
  },
  moduleOwnership: {
    [declarationIdentifier]: {
      ownerModule: string | null,
      ownerModules: string[]
    }
  }
}
~~~

The operation returns a fresh value with this shape:

~~~js
{
  status: "bound" | "blocked",
  selectedModule: string | null,
  applied: [{ target: string, triples: PublicTriple[] }],
  orphans: [{ target: string, triples: PublicTriple[], diagnostic }],
  diagnostics: Diagnostic[]
}
~~~

Blocking diagnostics use { severity: "error", code, target?, predicate?, detail? }. Use these stable codes so malformed input is inspectable without exposing parser or package objects: VISUAL_GRAPH_INVALID, VISUAL_SOURCE_BYTES_LIMIT, VISUAL_QUAD_COUNT_LIMIT, VISUAL_EFFECTIVE_MODEL_INVALID, VISUAL_SOURCE_DESCRIPTOR_REQUIRED, VISUAL_SOURCE_DESCRIPTOR_CARDINALITY, VISUAL_DESCRIPTOR_TYPE_INVALID, VISUAL_UNKNOWN_PROPERTY, VISUAL_MODULE_REQUIRED, VISUAL_MODULE_CARDINALITY, VISUAL_MODULE_IRI_REQUIRED, VISUAL_MODULE_NOT_FOUND, VISUAL_MODULE_NOT_MODULE, VISUAL_TARGET_IRI_REQUIRED, VISUAL_CARDINALITY_INVALID, VISUAL_COORDINATE_PAIR_INVALID, VISUAL_DIMENSION_PAIR_INVALID, VISUAL_DECIMAL_INVALID, VISUAL_DIMENSION_NEGATIVE, VISUAL_COLOR_INVALID, and VISUAL_EXTENSION_INVALID.

Orphan diagnostics must use this exact public shape and no guessed context:

~~~js
{
  severity: "warning",
  code: "VISUAL_TARGET_ORPHAN",
  reason: "missing-target" | "cross-module" | "ambiguous-owner" | "unowned-target",
  target: string,
  selectedModule: string,
  ownerModule?: string,
  ownerModules?: string[]
}
~~~

For a unique non-selected owner include only ownerModule; for ambiguous ownership include only sorted ownerModules; for missing or unowned targets include neither optional owner field. Structural errors return status blocked, the known selectedModule only when descriptor/module binding already succeeded, empty applied and orphans, and only blocking diagnostics. A valid binding returns orphan warnings in diagnostics in the same target/reason order as orphans.

---

### Task 1: Establish the data-only Visual Source seam and Module selection

**Files:**
- Create: src/visual-layer.mjs
- Create: test/visual-layer.test.mjs

**Interfaces:**
- Consumes: the existing inspectSemanticSource(input) result from src/contract-layer.mjs; only its effectiveModel.declarationIndex and effectiveModel.moduleOwnership maps are passed to the new operation.
- Produces: bindVisualSource(input, effectiveModel) with the result shape defined above; the private normalizeVisualGraph(input) helper returns an N3 Store used only inside this module.

- [ ] **Step 1: Write the failing input-form and descriptor tests**

Create the test file with this complete initial fixture and assertions:

~~~js
import assert from "node:assert/strict";
import test from "node:test";
import { Parser, Store } from "n3";

import { inspectSemanticSource, loadSemanticSource } from "../src/contract-layer.mjs";
import { bindVisualSource } from "../src/visual-layer.mjs";

const CONTRACT = "https://github.com/TalbyAI/talby-domain/vocab/contract#";
const VISUAL = "https://github.com/TalbyAI/talby-domain/vocab/visual#";

function modelFrom(turtle) {
  const result = inspectSemanticSource(turtle);
  assert.equal(result.verification.status, "verified");
  return result.effectiveModel;
}

const model = modelFrom([
  "@prefix c: <", CONTRACT, "> .",
  "@prefix d: <urn:example:> .",
  "d:orders a c:Module ; c:name \"Orders\" .",
  "d:order a c:Entity ; c:name \"Order\" ; c:parent d:orders ."
].join("\n"));

const emptyVisual = [
  "@prefix visual: <", VISUAL, "> .",
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
      "@prefix visual: <", VISUAL, "> . @prefix d: <urn:example:> .",
      "d:order visual:x \"1\" ."
    ].join("\n"), "VISUAL_SOURCE_DESCRIPTOR_REQUIRED"],
    ["multiple descriptors", [
      "@prefix visual: <", VISUAL, "> . @prefix d: <urn:example:> .",
      "[] a visual:VisualSource ; visual:module d:orders .",
      "[] a visual:VisualSource ; visual:module d:orders ."
    ].join("\n"), "VISUAL_SOURCE_DESCRIPTOR_CARDINALITY"],
    ["missing module", [
      "@prefix visual: <", VISUAL, "> .",
      "[] a visual:VisualSource ."
    ].join("\n"), "VISUAL_MODULE_REQUIRED"],
    ["multiple modules", [
      "@prefix visual: <", VISUAL, "> . @prefix d: <urn:example:> .",
      "[] a visual:VisualSource ; visual:module d:orders, d:order ."
    ].join("\n"), "VISUAL_MODULE_CARDINALITY"],
    ["unknown module", [
      "@prefix visual: <", VISUAL, "> . @prefix d: <urn:example:> .",
      "[] a visual:VisualSource ; visual:module d:missing ."
    ].join("\n"), "VISUAL_MODULE_NOT_FOUND"],
    ["non-Module binding", [
      "@prefix visual: <", VISUAL, "> . @prefix d: <urn:example:> .",
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
~~~

- [ ] **Step 2: Run the focused test and verify the missing-export failure**

Run:

~~~powershell
node --test test/visual-layer.test.mjs
~~~

Expected: FAIL before implementation because src/visual-layer.mjs does not exist.

- [ ] **Step 3: Implement normalization and descriptor/module selection**

Create src/visual-layer.mjs with N3 only. Keep RDF/JS objects private and convert all accepted terms to fresh plain objects before they enter a returned result. The core normalization helpers must have this behavior:

~~~js
import { DataFactory, Parser, Store } from "n3";

const { blankNode, defaultGraph, literal, namedNode, quad } = DataFactory;
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const VISUAL = "https://github.com/TalbyAI/talby-domain/vocab/visual#";
const VISUAL_SOURCE = VISUAL + "VisualSource";
const VISUAL_MODULE = VISUAL + "module";
const MAX_BYTES = 1_048_576;
const MAX_QUADS = 10_000;

class VisualGraphLimitError extends RangeError {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function rejectNonTurtleExtensions(input) {
  let comment = false;
  let iri = false;
  let quote = null;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (comment) {
      if (character === "\n" || character === "\r") comment = false;
      continue;
    }
    if (quote) {
      if (character === "\\") {
        index += 1;
        continue;
      }
      if (input.startsWith(quote, index)) {
        index += quote.length - 1;
        quote = null;
      }
      continue;
    }
    if (iri) {
      if (character === ">") iri = false;
      continue;
    }
    if (character === "#") {
      comment = true;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = input.startsWith(character.repeat(3), index) ? character.repeat(3) : character;
      index += quote.length - 1;
      continue;
    }
    if (character === "<") {
      if (input[index + 1] === "<") throw new SyntaxError("RDF-star syntax is not supported");
      iri = true;
      continue;
    }
    if (character === ">" && input[index + 1] === ">") throw new SyntaxError("RDF-star syntax is not supported");
    for (const directive of ["PREFIX", "BASE"]) {
      if (input.slice(index, index + directive.length).toUpperCase() !== directive) continue;
      const previous = input[index - 1];
      const next = input[index + directive.length];
      const escapedPrevious = input[index - 2] === "\\";
      const boundary = !escapedPrevious && (index === 0 || !/[A-Za-z0-9_:%@.-]/.test(previous) || (previous === "." && /[\s;,[\](){}]/.test(input[index - 2] ?? "")));
      if (boundary && /[\s#<]/.test(next ?? "")) throw new SyntaxError("SPARQL directives are not supported in Turtle");
    }
  }
}

function containsQuadTerm(value) {
  return [value.subject, value.predicate, value.object, value.graph].some((term) => term?.termType === "Quad");
}

function termKey(term) {
  return term.termType + ":" + term.value;
}

function publicTerm(term) {
  if (term.termType === "Literal") {
    return {
      termType: "Literal",
      value: term.value,
      datatype: term.datatype.value,
      language: term.language || null
    };
  }
  return { termType: term.termType, value: term.value };
}

function publicTriple(value) {
  return {
    subject: publicTerm(value.subject),
    predicate: publicTerm(value.predicate),
    object: publicTerm(value.object)
  };
}

function rdfTerm(term) {
  if (!term || typeof term.termType !== "string") throw new TypeError("RDF term is required");
  if (term.termType !== "DefaultGraph" && typeof term.value !== "string") throw new TypeError("RDF term value is required");
  if (term.termType === "NamedNode") return namedNode(term.value);
  if (term.termType === "BlankNode") return blankNode(term.value);
  if (term.termType === "DefaultGraph") return defaultGraph();
  if (term.termType === "Literal") {
    const datatype = term.datatype?.value ?? term.datatype;
    if (typeof term.value !== "string" || typeof datatype !== "string") throw new TypeError("Literal datatype is required");
    return term.language ? literal(term.value, term.language) : literal(term.value, namedNode(datatype));
  }
  throw new TypeError("Unsupported RDF term");
}

function rdfQuad(value) {
  if (!value || typeof value !== "object") throw new TypeError("RDF quad is required");
  const graph = value.graph === undefined ? defaultGraph() : rdfTerm(value.graph);
  if (graph.termType !== "DefaultGraph") throw new TypeError("Named graphs are not supported");
  if ([value.subject, value.predicate, value.object, value.graph].some((term) => term?.termType === "Quad")) {
    throw new TypeError("RDF-star syntax is not supported");
  }
  const subject = rdfTerm(value.subject);
  const predicate = rdfTerm(value.predicate);
  const object = rdfTerm(value.object);
  if (subject.termType === "Literal" || predicate.termType !== "NamedNode") throw new TypeError("Invalid RDF triple positions");
  return quad(subject, predicate, object, graph);
}

function normalizeVisualGraph(input) {
  if (typeof input === "string") {
    if (Buffer.byteLength(input, "utf8") > MAX_BYTES) throw new VisualGraphLimitError("VISUAL_SOURCE_BYTES_LIMIT");
    rejectNonTurtleExtensions(input);
    const parsed = new Parser({ format: "text/turtle" }).parse(input);
    if (parsed.length > MAX_QUADS) throw new VisualGraphLimitError("VISUAL_QUAD_COUNT_LIMIT");
    if (parsed.some(containsQuadTerm)) throw new SyntaxError("RDF-star syntax is not supported");
    return new Store(parsed);
  }
  const graph = input?.graph ?? (input && typeof input[Symbol.iterator] === "function" ? input : null);
  if (!graph || typeof graph[Symbol.iterator] !== "function") throw new TypeError("Visual Source graph is required");
  const values = [...graph];
  if (values.length > MAX_QUADS) throw new VisualGraphLimitError("VISUAL_QUAD_COUNT_LIMIT");
  return new Store(values.map(rdfQuad));
}

function diagnostic(code, fields = {}) {
  return { severity: "error", code, ...fields };
}

function blocked(diagnostics, selectedModule = null) {
  return {
    status: "blocked",
    selectedModule,
    applied: [],
    orphans: [],
    diagnostics
  };
}

function validEffectiveModel(model) {
  return model !== null
    && typeof model === "object"
    && model.declarationIndex !== null
    && typeof model.declarationIndex === "object"
    && model.moduleOwnership !== null
    && typeof model.moduleOwnership === "object";
}

function selectModule(dataset, model) {
  const descriptors = [...dataset.match(null, namedNode(RDF_TYPE), namedNode(VISUAL_SOURCE))]
    .map(({ subject }) => subject);
  if (descriptors.length === 0) return { diagnostics: [diagnostic("VISUAL_SOURCE_DESCRIPTOR_REQUIRED")] };
  if (descriptors.length > 1) return { diagnostics: [diagnostic("VISUAL_SOURCE_DESCRIPTOR_CARDINALITY")] };
  const descriptor = descriptors[0];
  const modules = [...dataset.match(descriptor, namedNode(VISUAL_MODULE), null)].map(({ object }) => object);
  if (modules.length === 0) return { diagnostics: [diagnostic("VISUAL_MODULE_REQUIRED")] };
  if (modules.length > 1) return { diagnostics: [diagnostic("VISUAL_MODULE_CARDINALITY")] };
  if (modules[0].termType !== "NamedNode") return { diagnostics: [diagnostic("VISUAL_MODULE_IRI_REQUIRED")] };
  const selectedModule = modules[0].value;
  const declaration = Object.hasOwn(model.declarationIndex, selectedModule)
    ? model.declarationIndex[selectedModule]
    : null;
  if (!declaration) return { diagnostics: [diagnostic("VISUAL_MODULE_NOT_FOUND", { target: selectedModule })] };
  if (declaration.kind !== "Module") return { diagnostics: [diagnostic("VISUAL_MODULE_NOT_MODULE", { target: selectedModule })] };
  return { descriptor, selectedModule, diagnostics: [] };
}

export function bindVisualSource(input, effectiveSemanticModel) {
  let dataset;
  try {
    dataset = normalizeVisualGraph(input);
  } catch (error) {
    return blocked([diagnostic(error.code ?? "VISUAL_GRAPH_INVALID", { detail: error.message })]);
  }
  if (!validEffectiveModel(effectiveSemanticModel)) return blocked([diagnostic("VISUAL_EFFECTIVE_MODEL_INVALID")]);
  const selection = selectModule(dataset, effectiveSemanticModel);
  if (selection.diagnostics.length) return blocked(selection.diagnostics);
  return {
    status: "bound",
    selectedModule: selection.selectedModule,
    applied: [],
    orphans: [],
    diagnostics: []
  };
}
~~~

Do not import or call inspectSemanticSource, loadSemanticSource, verifySemanticSource, materializeEffectiveModel, createAcceptanceService, fetch, eval, Function, or a dynamic import from this module. The only Semantic Source data used later is the two effective-model maps passed as the second argument.

- [ ] **Step 4: Run the focused tests and confirm the seam is green**

Run:

~~~powershell
node --test test/visual-layer.test.mjs
~~~

Expected: all Task 1 tests pass, and the result contains only plain data values.

- [ ] **Step 5: Commit the public seam**

~~~powershell
git add src/visual-layer.mjs test/visual-layer.test.mjs
git commit -m "feat: establish Visual Source binding seam"
~~~

---

### Task 2: Validate core annotations and classify binding results

**Files:**
- Modify: src/visual-layer.mjs
- Modify: test/visual-layer.test.mjs

**Interfaces:**
- Consumes: normalizeVisualGraph(input), the selected { descriptor, selectedModule }, and the effective model maps from Task 1.
- Produces: one { target, triples } record per valid named annotation subject; triples contains that subject's direct triples plus every reachable visual:extension subtree. The public operation returns applied and orphan records without mutating either input.

- [ ] **Step 1: Add failing tests for core shape, extension preservation, and blocking validation**

Add these helpers and tests to test/visual-layer.test.mjs:

~~~js
const XSD = "http://www.w3.org/2001/XMLSchema#";

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
~~~

Add DataFactory to the existing N3 import in this ESM test file:

~~~js
import { DataFactory, Parser, Store } from "n3";
~~~

Use DataFactory.quad, DataFactory.namedNode, and DataFactory.literal in the named-graph test. This keeps the test executable under the repository's type module setting.

- [ ] **Step 2: Run the focused tests and verify they fail on missing annotation behavior**

Run:

~~~powershell
node --test test/visual-layer.test.mjs
~~~

Expected: Task 1 remains green; the new tests fail because the current implementation returns no annotation records and does not validate the Visual Source core shape.

- [ ] **Step 3: Add the closed core shape and extension-closure helpers**

Add these exact constants and helper contracts to src/visual-layer.mjs:

~~~js
const VISUAL_X = VISUAL + "x";
const VISUAL_Y = VISUAL + "y";
const VISUAL_WIDTH = VISUAL + "width";
const VISUAL_HEIGHT = VISUAL + "height";
const VISUAL_FILL = VISUAL + "fill";
const VISUAL_STROKE = VISUAL + "stroke";
const VISUAL_EXTENSION = VISUAL + "extension";
const CORE_PREDICATES = new Set([
  VISUAL_X, VISUAL_Y, VISUAL_WIDTH, VISUAL_HEIGHT,
  VISUAL_FILL, VISUAL_STROKE, VISUAL_EXTENSION
]);
const DECIMAL_PATTERN = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/;
const COLOR_PATTERN = /^#[0-9A-Fa-f]{8}$/;

function values(dataset, subject, predicate) {
  return [...dataset.match(subject, namedNode(predicate), null)].map(({ object }) => object);
}

function isNode(term) {
  return term?.termType === "NamedNode" || term?.termType === "BlankNode";
}

function isDecimal(term) {
  return term?.termType === "Literal"
    && term.datatype.value === "http://www.w3.org/2001/XMLSchema#decimal"
    && DECIMAL_PATTERN.test(term.value);
}

function isNonNegativeDecimal(term) {
  return isDecimal(term) && (!term.value.startsWith("-") || !/[1-9]/.test(term.value));
}

function isColor(term) {
  return term?.termType === "Literal"
    && !term.language
    && term.datatype.value === "http://www.w3.org/2001/XMLSchema#string"
    && COLOR_PATTERN.test(term.value);
}

function extensionNodesFrom(dataset, subject) {
  const seen = new Set();
  const queue = values(dataset, subject, VISUAL_EXTENSION).filter(isNode);
  while (queue.length) {
    const node = queue.shift();
    const key = termKey(node);
    if (seen.has(key)) continue;
    seen.add(key);
    for (const { object } of dataset.match(node, null, null)) if (isNode(object)) queue.push(object);
  }
  return seen;
}

function allExtensionNodes(dataset) {
  const seen = new Set();
  for (const { subject } of dataset.match(null, namedNode(VISUAL_EXTENSION), null)) {
    for (const key of extensionNodesFrom(dataset, subject)) seen.add(key);
  }
  return seen;
}

function annotationSubjects(dataset, descriptor, extensionNodes) {
  const descriptorKey = termKey(descriptor);
  return [...new Map([...dataset]
    .filter(({ subject }) => termKey(subject) !== descriptorKey && !extensionNodes.has(termKey(subject)))
    .map(({ subject }) => [termKey(subject), subject])).values()];
}

function annotationTriples(dataset, target) {
  const extensionNodes = extensionNodesFrom(dataset, target);
  return [...dataset]
    .filter(({ subject }) => termKey(subject) === termKey(target) || extensionNodes.has(termKey(subject)))
    .map(publicTriple);
}
~~~

Validate the descriptor separately: it may be a BlankNode or NamedNode; it may contain exactly one rdf:type visual:VisualSource and exactly one visual:module NamedNode; its other predicates are blocking unknown properties. Validate every non-extension root subject as an annotation: a BlankNode root produces VISUAL_TARGET_IRI_REQUIRED, while a NamedNode root may contain only the seven predicates in CORE_PREDICATES. Count distinct RDF graph values after the Store deduplicates repeated triples; more than one value for any core predicate produces VISUAL_CARDINALITY_INVALID.

For each annotation, enforce these rules and retain every diagnostic before sorting it:

~~~js
function validateAnnotation(dataset, target) {
  const diagnostics = [];
  const triples = [...dataset.match(target, null, null)];
  for (const triple of triples) {
    if (!CORE_PREDICATES.has(triple.predicate.value)) {
      diagnostics.push(diagnostic("VISUAL_UNKNOWN_PROPERTY", {
        target: target.value,
        predicate: triple.predicate.value
      }));
    }
  }

  const properties = [VISUAL_X, VISUAL_Y, VISUAL_WIDTH, VISUAL_HEIGHT, VISUAL_FILL, VISUAL_STROKE, VISUAL_EXTENSION];
  for (const predicate of properties) {
    if (values(dataset, target, predicate).length > 1) diagnostics.push(diagnostic("VISUAL_CARDINALITY_INVALID", { target: target.value, predicate }));
  }

  const x = values(dataset, target, VISUAL_X);
  const y = values(dataset, target, VISUAL_Y);
  if ((x.length === 0) !== (y.length === 0)) diagnostics.push(diagnostic("VISUAL_COORDINATE_PAIR_INVALID", { target: target.value }));
  if (x[0] && !isDecimal(x[0])) diagnostics.push(diagnostic("VISUAL_DECIMAL_INVALID", { target: target.value, predicate: VISUAL_X }));
  if (y[0] && !isDecimal(y[0])) diagnostics.push(diagnostic("VISUAL_DECIMAL_INVALID", { target: target.value, predicate: VISUAL_Y }));

  const width = values(dataset, target, VISUAL_WIDTH);
  const height = values(dataset, target, VISUAL_HEIGHT);
  if ((width.length === 0) !== (height.length === 0)) diagnostics.push(diagnostic("VISUAL_DIMENSION_PAIR_INVALID", { target: target.value }));
  for (const [predicate, value] of [[VISUAL_WIDTH, width[0]], [VISUAL_HEIGHT, height[0]]]) {
    if (!value) continue;
    if (!isDecimal(value)) diagnostics.push(diagnostic("VISUAL_DECIMAL_INVALID", { target: target.value, predicate }));
    else if (!isNonNegativeDecimal(value)) diagnostics.push(diagnostic("VISUAL_DIMENSION_NEGATIVE", { target: target.value, predicate }));
  }

  for (const predicate of [VISUAL_FILL, VISUAL_STROKE]) {
    const value = values(dataset, target, predicate)[0];
    if (value && !isColor(value)) diagnostics.push(diagnostic("VISUAL_COLOR_INVALID", { target: target.value, predicate }));
  }

  const extensions = values(dataset, target, VISUAL_EXTENSION);
  if (extensions[0] && !isNode(extensions[0])) diagnostics.push(diagnostic("VISUAL_EXTENSION_INVALID", { target: target.value, predicate: VISUAL_EXTENSION }));
  return diagnostics;
}
~~~

The descriptor validator must also reject a non-visual:VisualSource extra rdf:type object with VISUAL_DESCRIPTOR_TYPE_INVALID, and it must report a descriptor predicate outside rdf:type/visual:module as VISUAL_UNKNOWN_PROPERTY. Extension subtrees are deliberately exempt from the closed shape after their link is validated; copy their arbitrary predicates as inert RDF data and do not inspect their names, values, IRIs, or literals.

- [ ] **Step 4: Group valid annotations and classify ownership without guessing**

Use this ownership decision table in a private classifyAnnotation(record, model, selectedModule) helper:

~~~text
target absent from declarationIndex                                  -> missing-target
ownerModules is []                                                    -> unowned-target
ownerModules has more than one entry                                  -> ambiguous-owner
exactly one owner equal to selectedModule and ownerModule matches     -> applied
exactly one owner different from selectedModule                       -> cross-module
~~~

Do not derive ownership from names, namespace prefixes, visual graph references, or a fallback ownerModule when ownerModules is absent. For the verified effective model produced by Contract Layer, use moduleOwnership[target].ownerModules as the complete ownership set and require ownerModule === ownerModules[0] for the unique-owner case. A declaration present in declarationIndex but missing its ownership record is unowned.

Implement the classification branch as concrete code:

~~~js
function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function orphan(record, selectedModule, reason, ownership = []) {
  const diagnosticValue = {
    severity: "warning",
    code: "VISUAL_TARGET_ORPHAN",
    reason,
    target: record.target,
    selectedModule
  };
  if (reason === "cross-module") diagnosticValue.ownerModule = ownership[0];
  if (reason === "ambiguous-owner") diagnosticValue.ownerModules = [...ownership].sort(compareText);
  return { target: record.target, triples: record.triples, diagnostic: diagnosticValue };
}

function classifyAnnotation(record, model, selectedModule) {
  if (!Object.hasOwn(model.declarationIndex, record.target)) return orphan(record, selectedModule, "missing-target");
  const ownership = model.moduleOwnership[record.target];
  const ownerModules = Array.isArray(ownership?.ownerModules) ? [...ownership.ownerModules] : [];
  if (ownerModules.length === 0) return orphan(record, selectedModule, "unowned-target");
  if (ownerModules.length > 1) return orphan(record, selectedModule, "ambiguous-owner", ownerModules);
  if (ownership.ownerModule === ownerModules[0] && ownerModules[0] === selectedModule) {
    return { target: record.target, triples: record.triples };
  }
  if (ownership.ownerModule === ownerModules[0]) return orphan(record, selectedModule, "cross-module", ownerModules);
  return orphan(record, selectedModule, "unowned-target");
}

function bindValidatedAnnotations(records, model, selectedModule) {
  const applied = [];
  const orphans = [];
  const diagnostics = [];
  for (const record of records) {
    const classified = classifyAnnotation(record, model, selectedModule);
    if (classified.diagnostic) {
      orphans.push(classified);
      const publicDiagnostic = { ...classified.diagnostic };
      if (publicDiagnostic.ownerModules) publicDiagnostic.ownerModules = [...publicDiagnostic.ownerModules];
      diagnostics.push(publicDiagnostic);
    } else {
      applied.push(classified);
    }
  }
  return { applied, orphans, diagnostics };
}
~~~

Omit optional fields instead of emitting ownerModules: undefined in final public objects. When validateAnnotation or descriptor/target validation returns an error, return blocked(errors, selectedModule) before classification so no annotation is exposed as applied or orphaned. Otherwise return the classification result with status bound and the selected Module IRI.

- [ ] **Step 5: Run focused tests and inspect the public data boundary**

Run:

~~~powershell
node --test test/visual-layer.test.mjs
~~~

Expected: all Task 1 and Task 2 tests pass; invalid core data has no partial groups, valid extension data is copied as plain triples, and no returned term has RDF/JS methods or package-specific fields.

- [ ] **Step 6: Commit core validation and binding classification**

~~~powershell
git add src/visual-layer.mjs test/visual-layer.test.mjs
git commit -m "feat: validate and bind Visual annotations"
~~~

---

### Task 3: Prove orphan semantics, stable identity, and deterministic ordering

**Files:**
- Modify: src/visual-layer.mjs
- Modify: test/visual-layer.test.mjs

**Interfaces:**
- Consumes: the complete bindVisualSource result from Task 2 and the effective-model ownership seam where a Module owns itself and nested declarations inherit the root Module.
- Produces: sorted applied, orphans, their extension-preserving triples, and sorted orphan diagnostics with the exact ADR-0009 fields.

- [ ] **Step 1: Add failing conformance tests for every orphan reason and stable Declaration Identifier anchoring**

Add this multi-Module fixture and tests:

~~~js
const multiModel = modelFrom([
  "@prefix c: <", CONTRACT, "> .",
  "@prefix d: <urn:example:> .",
  "d:orders a c:Module ; c:name \"Orders\" .",
  "d:sales a c:Module ; c:name \"Sales\" .",
  "d:order a c:Entity ; c:name \"Order\" ; c:parent d:orders .",
  "d:invoice a c:Entity ; c:name \"Invoice\" ; c:parent d:sales .",
  "d:shared a c:Field ; c:parent d:orders, d:sales .",
  "d:unowned a c:Field ."
].join("\n"));

function multiVisual(entries, module = "d:orders") {
  return [
    "@prefix visual: <" + VISUAL + "> .",
    "@prefix d: <urn:example:> .",
    "@prefix xsd: <" + XSD + "> .",
    "[] a visual:VisualSource ; visual:module " + module + " .",
    entries.map(({ target, suffix = "" }) => target + " visual:x \"1\"^^xsd:decimal ; visual:y \"2\"^^xsd:decimal" + suffix + " .").join("\n")
  ].join("\n");
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

test("keeps a visual annotation attached after semantic rename and reorganization", () => {
  const firstModel = modelFrom([
    "@prefix c: <", CONTRACT, "> .",
    "@prefix d: <urn:stable:> .",
    "d:one a c:Module ; c:name \"One\" .",
    "d:order a c:Entity ; c:name \"Order\" ; c:parent d:one ."
].join("\n"));
  const secondModel = modelFrom([
    "@prefix c: <", CONTRACT, "> .",
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
~~~

- [ ] **Step 2: Run the tests and verify ordering is the remaining failure**

Run:

~~~powershell
node --test test/visual-layer.test.mjs
~~~

Expected: orphan classification and stable-identifier assertions identify the correct cases; the equivalent-ordering assertion fails until every output collection is explicitly sorted.

- [ ] **Step 3: Make all public ordering independent of input order**

Reuse the compareText code-point comparator from Task 2 and add these stable keys. Do not use locale-dependent ordering:

~~~js
function termSortKey(term) {
  return [
    term.termType,
    term.value,
    term.datatype?.value ?? "",
    term.language ?? ""
  ].join("\u0000");
}

function tripleSortKey(triple) {
  return [
    termSortKey(triple.subject),
    termSortKey(triple.predicate),
    termSortKey(triple.object)
  ].join("\u0000");
}

function diagnosticSortKey(value) {
  return [value.target ?? "", value.reason ?? "", value.code ?? "", value.predicate ?? ""].join("\u0000");
}
~~~

Sort annotation subjects by subject.value; sort each annotationTriples array by tripleSortKey after conversion to public triples; sort applied and orphans by target; and sort bound diagnostics by diagnosticSortKey. Sort blocking diagnostics by target, predicate, code, and detail. Preserve ownerModules sorted with compareText. Return fresh arrays for every result and do not reuse the input graph's arrays.

- [ ] **Step 4: Run the complete focused Visual Source suite**

Run:

~~~powershell
node --test test/visual-layer.test.mjs
~~~

Expected: all Visual Source tests pass with deterministic applied, orphans, triples, and diagnostic order.

- [ ] **Step 5: Commit orphan and determinism coverage**

~~~powershell
git add src/visual-layer.mjs test/visual-layer.test.mjs
git commit -m "feat: classify orphan Visual annotations deterministically"
~~~

---

### Task 4: Verify graph immutability and semantic execution isolation

**Files:**
- Modify: test/visual-layer.test.mjs
- Inspect: src/contract-layer.mjs
- Inspect: src/contract-acceptance.mjs
- Inspect: docs/adr/0008-fuente-visual-anotaciones.md
- Inspect: docs/adr/0009-vinculo-ejecutable-fuente-visual-modulo.md

**Interfaces:**
- Consumes: bindVisualSource, PROJECT_SEMANTIC_SOURCE, PROJECT_MOCKING_SOURCE, createAcceptanceService, and the existing loaded-source graph shape.
- Produces: public evidence that Visual Source binding cannot rewrite the graph, effective model, generated client, authorization result, semantic payload, Mocking Source result, compatibility result, or external runtime state.

- [ ] **Step 1: Add the public-boundary isolation test**

Add this test. It uses one acceptance service and snapshots every behavior that the Visual Source is forbidden to affect:

~~~js
import {
  PROJECT_MOCKING_SOURCE,
  PROJECT_SEMANTIC_SOURCE,
  createAcceptanceService
} from "../src/contract-acceptance.mjs";

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
    assert.deepEqual(service.execute(permissionRequest), permissionBefore);
    assert.deepEqual(service.client.approveProject("project-1"), mockingBefore);
    assert.deepEqual(service.compareCompatibility(service.effectiveModel, service.effectiveModel), compatibilityBefore);
  } finally {
    service.close();
  }
});
~~~

- [ ] **Step 2: Add the no-network/no-script extension test**

Use an external IRI and script-looking literal only as inert extension data. The test must restore global state even if an assertion fails:

~~~js
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
~~~

- [ ] **Step 3: Run the focused and repository-wide tests**

Run:

~~~powershell
node --test test/visual-layer.test.mjs
npm test
~~~

Expected: the focused suite and all existing Contract Layer/acceptance tests pass; no existing test file or acceptance-service behavior changes.

- [ ] **Step 4: Inspect the final boundary and repository diff**

Run:

~~~powershell
rg -n '\b(fetch|eval|Function|import\()' src/visual-layer.mjs
git diff --check
git status --short
git diff --name-only
~~~

Expected: the first command finds no runtime loader/evaluator call, git diff --check is clean, and git status shows only this plan plus the intended Visual Source module/test (or a clean tree if the plan was committed separately); no unrelated or prototype changes appear.

- [ ] **Step 5: Commit the isolation evidence**

~~~powershell
git add test/visual-layer.test.mjs
git commit -m "test: verify Visual Source execution isolation"
~~~

## Self-review against the specification

- The public operation, input forms, data-only result, and selected-Module binding are covered by Task 1.
- Exactly one descriptor and one module IRI, valid loaded Module resolution, invalid graph input, non-IRI targets, closed predicates, cardinalities, coordinate/dimension pairs, decimal values, dimensions, and colors are covered by Tasks 1–2.
- Direct annotation triples, reachable extension content, orphan triples, and no graph rewrite are covered by Tasks 2 and 4.
- Missing, cross-Module, ambiguous, and unowned targets use the exact ADR-0009 orphan shape in Task 3; valid same-Module annotations remain applied in mixed input.
- Stable Declaration Identifier anchoring after semantic rename/reorganization and deterministic repeated validation are covered by Task 3.
- Semantic model, generated client, routes, authorization, payloads, Mocking Source behavior, compatibility output, network access, and script execution isolation are covered by Task 4.
- Existing Contract Layer and acceptance tests remain unchanged and are rerun by Task 4.
- No requirement in the design is left without a task; the explicit exclusions remain outside the file map.
