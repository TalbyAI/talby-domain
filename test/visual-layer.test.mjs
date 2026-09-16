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
