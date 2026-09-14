# Contract Layer Semantic Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the smallest production Contract Layer seam that loads and verifies a Semantic Source, materializes an effective model, and exposes stable Declaration Identifier and Module-ownership data for downstream consumers.

**Architecture:** A pure ECMAScript module accepts either approved-subset Turtle or an already materialized RDF triple list, normalizes it into an immutable-in-result Semantic Source, verifies declaration structure, and returns an effective model. The public interface exposes one inspection function plus the source loader; ownership resolution stays inside this module and contains no Visual Source behavior.

**Tech Stack:** Node.js ECMAScript modules, the Node standard library, and `node:test`; no runtime dependencies, network access, generated files, or prototype references.

## Global Constraints

- Semantic, Visual, Mocking, and Governance Sources remain separate RDF sources with separate ontologies.
- A Declaration Identifier is the stable IRI of a semantic declaration and is independent of its name and parent.
- A Module is parentless and owns itself; other declarations inherit the root Module reached through their semantic `parent` chain.
- Verification is blocking for malformed source, missing organizational parents, invalid declaration identifiers, and parent cycles; no partial effective model is returned.
- Ownership data is deterministic and preserves multiple or zero resolved owners so a later Visual Source consumer can report ambiguity or orphaning without guessing.
- The input source and graph are never rewritten; the returned result is a separate object.
- Production code, tests, and documentation are outside `prototypes/`; existing prototypes remain unchanged and isolated.
- Human-readable repository content and comments are written in English.

---

### Task 1: Establish the public seam with failing tests

**Files:**
- Create: `src/contract-layer.mjs`
- Create: `test/contract-layer.test.mjs`

**Interfaces:**
- `inspectSemanticSource(turtleOrGraph)` returns `{ source, verification, effectiveModel }`.
- `loadSemanticSource(turtleOrGraph)` returns a normalized Semantic Source.
- `materializeEffectiveModel(verifiedSource)` returns a model only after successful verification.

- [ ] **Step 1: Write the failing same-Module ownership test**

```js
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
```

- [ ] **Step 2: Run the focused test and verify the expected missing-export failure**

Run: `node --test test/contract-layer.test.mjs`

Expected: FAIL because `test/contract-layer.test.mjs` cannot import the missing module exports.

- [ ] **Step 3: Add the minimal module export surface**

```js
export function inspectSemanticSource() {
  throw new Error("not implemented");
}

export function loadSemanticSource() {
  throw new Error("not implemented");
}

export function materializeEffectiveModel() {
  throw new Error("not implemented");
}
```

- [ ] **Step 4: Re-run the focused test and verify the expected implementation failure**

Run: `node --test test/contract-layer.test.mjs`

Expected: FAIL because the seam still has no source parsing or materialization behavior.

- [ ] **Step 5: Commit the red seam**

```powershell
git add -- src/contract-layer.mjs test/contract-layer.test.mjs
git commit -m "test: define Contract Layer semantic seam"
```

### Task 2: Load the bounded RDF/Turtle source and verify declarations

**Files:**
- Modify: `src/contract-layer.mjs`
- Modify: `test/contract-layer.test.mjs`

**Interfaces:**
- `loadSemanticSource(input)` accepts Turtle text or `{ graph: Triple[] }` and returns `{ raw, graph, declarations }`.
- `inspectSemanticSource(input)` returns a blocking verification result when the source has no stable declaration IRI or has an invalid hierarchy.

- [ ] **Step 1: Add a failing parser and blocking-verification test**

```js
test("keeps the Semantic Source graph separate and blocks a parent cycle", () => {
  const turtle = `
    @prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
    @prefix d: <urn:example:> .
    d:orders a c:Module ; c:name "Orders" .
    d:one a c:Feature ; c:name "One" ; c:parent d:two .
    d:two a c:Feature ; c:name "Two" ; c:parent d:one .
  `;
  const result = inspectSemanticSource(turtle);

  assert.equal(result.verification.status, "blocked");
  assert.equal(result.effectiveModel, null);
  assert.match(result.verification.diagnostics[0].code, /PARENT_CYCLE/);
  assert.equal(result.source.raw, turtle);
  assert.equal(result.source.graph.some((triple) => triple.predicate.value.endsWith("/parent")), true);
});
```

- [ ] **Step 2: Run the test and verify it fails for the missing parser/verification behavior**

Run: `node --test test/contract-layer.test.mjs`

Expected: FAIL because the loader does not yet produce RDF terms or hierarchy diagnostics.

- [ ] **Step 3: Implement only the approved Turtle subset and source normalization**

Implement prefix declarations, named IRI/prefixed-name terms, literals, `a`, semicolon/comma predicate lists, and blank-node property lists. Keep the graph as triples and derive declarations only from contract declaration types.

- [ ] **Step 4: Implement structural verification**

Reject blank-node declaration identifiers, parentless organizational declarations, non-Module parents, missing parents, and parent cycles. Sort diagnostics by `code` and target IRI before returning them.

- [ ] **Step 5: Run the focused test and the complete test file**

Run: `node --test test/contract-layer.test.mjs`

Expected: PASS with zero failures.

- [ ] **Step 6: Commit the loader and verification increment**

```powershell
git add -- src/contract-layer.mjs test/contract-layer.test.mjs
git commit -m "feat: load and verify Semantic Source declarations"
```

### Task 3: Materialize stable declarations and Module ownership

**Files:**
- Modify: `src/contract-layer.mjs`
- Modify: `test/contract-layer.test.mjs`

**Interfaces:**
- `effectiveModel.declarationIndex[id]` exposes `declarationIdentifier`, `kind`, `name`, `parentIdentifiers`, `ownerModule`, and `ownerModules`.
- `effectiveModel.moduleOwnership[id]` exposes the deterministic `{ ownerModule, ownerModules }` seam consumed by #36.

- [ ] **Step 1: Add failing tests for rename/reorganization stability and ambiguous/unowned ownership**

```js
test("keeps the Declaration Identifier stable when name and parent change", () => {
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

test("exposes all resolved owners without choosing an ambiguous context", () => {
  const result = inspectSemanticSource({
    graph: [
      ["urn:example:one", "http://www.w3.org/1999/02/22-rdf-syntax-ns#type", "https://github.com/TalbyAI/talby-domain/vocab/contract#Module"],
      ["urn:example:two", "http://www.w3.org/1999/02/22-rdf-syntax-ns#type", "https://github.com/TalbyAI/talby-domain/vocab/contract#Module"],
      ["urn:example:shared", "http://www.w3.org/1999/02/22-rdf-syntax-ns#type", "https://github.com/TalbyAI/talby-domain/vocab/contract#Field"],
      ["urn:example:shared", "https://github.com/TalbyAI/talby-domain/vocab/contract#parent", "urn:example:one"],
      ["urn:example:shared", "https://github.com/TalbyAI/talby-domain/vocab/contract#parent", "urn:example:two"]
    ]
  });

  assert.deepEqual(result.effectiveModel.moduleOwnership["urn:example:shared"].ownerModules, ["urn:example:one", "urn:example:two"]);
  assert.equal(result.effectiveModel.moduleOwnership["urn:example:shared"].ownerModule, null);
});
```

- [ ] **Step 2: Run the tests and verify the new assertions fail**

Run: `node --test test/contract-layer.test.mjs`

Expected: FAIL because the effective model does not yet expose the index and ownership records.

- [ ] **Step 3: Implement deterministic ownership resolution**

Resolve a Module to itself, recursively union parent owners, sort owner IRIs, and return `ownerModule` only for exactly one owner. Preserve zero owners as `[]` and multiple owners as an explicit list.

- [ ] **Step 4: Implement the effective-model result**

Return a new object containing the normalized Semantic Source, declarations, `declarationIndex`, and `moduleOwnership`. Do not mutate or merge the original graph, and do not import or call any Visual Source code.

- [ ] **Step 5: Run all tests and inspect the public result**

Run: `node --test test/contract-layer.test.mjs`

Expected: PASS with zero failures; the test output must not contain warnings or network activity.

- [ ] **Step 6: Commit the effective-model seam**

```powershell
git add -- src/contract-layer.mjs test/contract-layer.test.mjs
git commit -m "feat: expose effective declaration ownership seam"
```

### Task 4: Verify the branch and hand off to #36

**Files:**
- Inspect: `AGENTS.md`
- Inspect: `CONTEXT.md`
- Inspect: `docs/adr/0008-fuente-visual-anotaciones.md`
- Inspect: `docs/adr/0009-vinculo-ejecutable-fuente-visual-modulo.md`
- Inspect: `docs/superpowers/specs/2026-09-14-visual-source-module-binding-agent-brief.md`

**Interfaces:**
- No new interface; this task verifies the implemented seam against the downstream binding contract.

- [ ] **Step 1: Run the complete repository test command**

Run: `node --test test/contract-layer.test.mjs`

Expected: PASS with zero failures.

- [ ] **Step 2: Check the branch diff and repository safety**

Run:

```powershell
git status --short
git diff --check origin/main...HEAD
git diff --name-only origin/main...HEAD
```

Expected: only the documentation base commit, this plan, `src/contract-layer.mjs`, and `test/contract-layer.test.mjs` appear; no prototype, Visual Source, or root exploratory sample changes appear.

- [ ] **Step 3: Review the final diff**

Confirm that the public result exposes Semantic Source, effective model, Declaration Identifier, and Module ownership; that visual binding is absent; and that no source graph is rewritten.

- [ ] **Step 4: Commit any review correction and rerun the complete test**

Use the smallest correction, then rerun `node --test test/contract-layer.test.mjs` and `git diff --check origin/main...HEAD` before reporting the branch ready.
