
# RDF/JS Contract Layer Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the handwritten Semantic Source parser and graph operations with pinned N3 RDF/JS storage, strict Turtle I/O, and a deterministic `rdf-validate-shacl` adapter without changing the public Contract Layer seam.

**Architecture:** `src/contract-layer.mjs` will parse input into an N3 `Store` held privately in a `WeakMap`, while public sources and effective models continue to expose only serializable term DTOs. Dataset-backed matching and writing will be routed through small data-only helpers; a focused SHACL adapter will normalize validator reports without exposing RDF/JS objects. `src/contract-acceptance.mjs` will consume those matching helpers while retaining its current public behavior.

**Tech Stack:** Node.js ESM, `n3@2.7.12`, `rdf-validate-shacl@0.6.5`, `node:sqlite`, `node:test`, and npm lockfile v3.

## Global Constraints

- Keep `source.graph`, `inspectSemanticSource`, the effective model, Declaration Identifiers, Module ownership, generated client, HTTP/JSON behavior, SQLite behavior, and diagnostics behavior compatible with the current public tests.
- Parse Turtle with `new Parser({ format: "text/turtle" })`; do not accept permissive N3/N-Triples/N-Quads extensions accidentally.
- Keep RDF/JS `Store`/`DatasetCore` objects private; no RDF package object may appear in public inspection results or effective models.
- Use direct `DatasetCore.match`; do not add `rdf-ext`, Comunica, `shacl-engine`, or `zazuko/env-node`, network loaders, reasoning, or external adapters.
- Pin exact direct dependencies to `n3@2.7.12` and `rdf-validate-shacl@0.6.5` after dependency, license, and security checks.
- Enforce 1 MiB UTF-8 Turtle input, 10,000 parsed quads, 1,000 normalized SHACL diagnostics, a 16 KiB UTF-8 limit per diagnostic detail, and a 1 MiB aggregate normalized-diagnostics limit before sorting; callers cannot disable these ceilings.
- Keep Semantic, Visual, Mocking, and Governance Sources separate. Do not implement Visual Source binding or change prototypes, samples, or unrelated public contracts.
- Human-readable repository prose, comments, docstrings, commits, and issue updates remain in English.
- Production code follows TDD: each new behavior gets a failing test, the failure is observed, then the smallest implementation is added.

---

### Task 1: Add the pinned Node package boundary

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Inspect: `.gitignore`

**Interfaces:**
- Produces `npm test` as the repository test command.
- Produces exact runtime dependencies `n3@2.7.12` and `rdf-validate-shacl@0.6.5`.

- [ ] **Step 1: Confirm the repository ignores installed dependencies**

Run:

```powershell
rg -n "node_modules|package-lock|npm" .gitignore
```

Expected: `node_modules` is ignored. If it is absent, add only `node_modules/` with `apply_patch` before installing packages.

- [ ] **Step 2: Create the minimal package manifest**

Create `package.json` with exactly this project-owned content before npm adds the dependency entries:

```json
{
  "name": "talby-domain",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22.5.0"
  },
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 3: Generate the exact lockfile without lifecycle scripts**

Run:

```powershell
npm install --ignore-scripts --package-lock-only --save-exact n3@2.7.12 rdf-validate-shacl@0.6.5
```

Expected: `package.json` contains exact dependency strings, `package-lock.json` exists, and no install script executes.

- [ ] **Step 4: Verify install, dependency tree, and audit baseline**

Run:

```powershell
npm ci --ignore-scripts
npm ls --depth=0
npm audit --omit=dev --audit-level=high
```

Expected: installation exits 0, both direct dependencies are exact, and the audit reports no high or critical vulnerability. Record any lower-severity advisory in the implementation handoff instead of silently ignoring it.

- [ ] **Step 5: Review licenses from resolved package metadata**

Run:

```powershell
node --input-type=module -e "import fs from 'node:fs'; import path from 'node:path'; const roots=['n3','rdf-validate-shacl']; for (const name of roots) { const file=path.join('node_modules',name,'package.json'); const pkg=JSON.parse(fs.readFileSync(file,'utf8')); console.log(name, pkg.version, pkg.license); }"
```

Expected: both direct packages report MIT; inspect the transitive package manifests referenced by the lockfile and record their license values before the final handoff.

- [ ] **Step 6: Run the existing tests through npm**

Run:

```powershell
npm test
```

Expected: the existing 39 tests pass before source changes begin.

- [ ] **Step 7: Commit the package boundary**

```powershell
git add package.json package-lock.json .gitignore
git commit -m "build: pin RDF/JS dependencies"
```


---

### Task 2: Replace the handwritten Turtle loader with private RDF/JS storage

**Files:**
- Modify: `src/contract-layer.mjs`
- Modify: `test/contract-layer.test.mjs`

**Interfaces:**
- `loadSemanticSource(input)` continues to accept Turtle text or `{ raw, graph }` data-only input and returns `{ raw, graph, declarations }`.
- `matchSemanticSource(source, options)` returns data-only triples. `options` is `{ subject?: string | null, predicate?: string | null, object?: TermLike | null }`.
- `serializeSemanticSource(source)` returns `Promise<string>` containing semantically equivalent Turtle.
- `inspectSemanticSource(input)` continues to return only data-only source, verification, and effective-model values.

- [ ] **Step 1: Add a failing strict-parser and public-boundary test**

Add these imports to `test/contract-layer.test.mjs`:

```js
import {
  inspectSemanticSource,
  loadSemanticSource,
  matchSemanticSource,
  serializeSemanticSource
} from "../src/contract-layer.mjs";
```

Add this test:

```js
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
```

- [ ] **Step 2: Run the focused test and verify the missing-export failure**

Run:

```powershell
node --test test/contract-layer.test.mjs
```

Expected: FAIL because `matchSemanticSource` and `serializeSemanticSource` do not exist yet, or because the current parser cannot satisfy the round-trip case.

- [ ] **Step 3: Replace parser term creation with N3 imports and private storage**

At the top of `src/contract-layer.mjs`, replace handwritten parser dependencies with:

```js
import { DataFactory, Parser, Store, Writer } from "n3";

const { blankNode, defaultGraph, literal, namedNode, quad } = DataFactory;
const datasets = new WeakMap();
const SOURCE_LIMITS = Object.freeze({ maxBytes: 1_048_576, maxQuads: 10_000, maxDiagnostics: 1_000 });

class SourceLimitError extends RangeError {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function sourceLimit(code) {
  return new SourceLimitError(code);
}
```

Keep the existing vocabulary constants, declaration kinds, and public diagnostic vocabulary. Delete `tokenise`, `TurtleParser`, and the handwritten term constructors after the new conversion helpers are in place.

- [ ] **Step 4: Add DTO/RDFJS conversion helpers**

Implement these helpers in `src/contract-layer.mjs`:

```js
function publicTerm(term) {
  if (term.termType === "Literal") {
    return { termType: "Literal", value: term.value, datatype: term.datatype.value, language: term.language || null };
  }
  return { termType: term.termType, value: term.value };
}

function rdfTerm(term) {
  if (term?.termType === "Literal") return literal(term.value, namedNode(term.datatype?.value ?? term.datatype), term.language ?? "");
  if (term?.termType === "BlankNode") return blankNode(term.value);
  if (term?.termType === "DefaultGraph") return defaultGraph();
  if (term?.termType === "NamedNode") return namedNode(term.value);
  throw new TypeError("Unsupported RDF term");
}

function publicTriple(value) {
  return { subject: publicTerm(value.subject), predicate: publicTerm(value.predicate), object: publicTerm(value.object) };
}

function inputQuad(value) {
  if (Array.isArray(value)) return quad(namedNode(value[0]), namedNode(value[1]), namedNode(value[2]));
  return quad(rdfTerm(value.subject), rdfTerm(value.predicate), rdfTerm(value.object), value.graph ? rdfTerm(value.graph) : defaultGraph());
}
```

Make `inputQuad` preserve an existing RDF/JS quad's literal datatype, language, blank-node label, and graph; do not coerce literal objects to named nodes.

- [ ] **Step 5: Implement strict loading and matching**

Replace `loadSemanticSource` with this behavior:

```js
export function loadSemanticSource(input) {
  const raw = typeof input === "string" ? input : input?.raw ?? null;
  if (typeof raw === "string" && Buffer.byteLength(raw, "utf8") > SOURCE_LIMITS.maxBytes) throw sourceLimit("SOURCE_BYTES_LIMIT");
  const parsed = typeof input === "string"
    ? new Parser({ format: "text/turtle" }).parse(input)
    : (input?.graph ?? []).map(inputQuad);
  if (parsed.length > SOURCE_LIMITS.maxQuads) throw sourceLimit("QUAD_COUNT_LIMIT");
  const dataset = new Store(parsed);
  const source = { raw, graph: [...dataset].map(publicTriple), declarations: declarationRecords(dataset) };
  datasets.set(source, dataset);
  return source;
}

export function matchSemanticSource(source, { subject = null, predicate = null, object = null } = {}) {
  const dataset = datasets.get(source);
  if (!dataset) throw new TypeError("Semantic Source was not loaded by loadSemanticSource");
  const asTerm = (value) => value === null ? null : typeof value === "string" ? namedNode(value) : rdfTerm(value);
  return [...dataset.match(asTerm(subject), asTerm(predicate), asTerm(object))].map(publicTriple);
}
```

Change `declarationRecords` and its internal `objects` helper to match the private dataset instead of filtering arrays. Preserve the existing sorted declaration records and diagnostic output.

- [ ] **Step 6: Implement N3 serialization**

Add:

```js
export function serializeSemanticSource(source) {
  const dataset = datasets.get(source);
  if (!dataset) throw new TypeError("Semantic Source was not loaded by loadSemanticSource");
  return new Promise((resolve, reject) => {
    const writer = new Writer({ format: "text/turtle" });
    writer.addQuads([...dataset]);
    writer.end((error, result) => error ? reject(error) : resolve(result));
  });
}
```

- [ ] **Step 7: Run the focused test and the complete Contract Layer file**

Run:

```powershell
node --test test/contract-layer.test.mjs
```

Expected: all existing Contract Layer tests plus the new round-trip test pass, with no parser warnings and no network activity.

- [ ] **Step 8: Commit the RDF/JS loader**

```powershell
git add src/contract-layer.mjs test/contract-layer.test.mjs
git commit -m "feat: load Semantic Sources with RDF/JS"
```


---

### Task 3: Add the structural SHACL adapter

**Files:**
- Create: `src/shacl-adapter.mjs`
- Modify: `src/contract-layer.mjs`
- Modify: `test/contract-layer.test.mjs`

**Interfaces:**
- `validateShaclDataset(dataDataset, shapesDataset, options)` returns `Promise<{ conforms: boolean, diagnostics: Diagnostic[] }>` and never returns validator objects.
- `validateSemanticSource(source, shapesInput)` loads the shape input privately and delegates to `validateShaclDataset`.
- A `Diagnostic` has `{ code, rule, target, paths, detail }`; `paths` is an array of JSON Pointer strings.

- [ ] **Step 1: Add a failing synthetic SHACL test**

Extend the import list from Task 2 with `validateSemanticSource`, then add:

```js
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
```

- [ ] **Step 2: Run the test and verify the expected missing-export failure**

Run:

```powershell
node --test test/contract-layer.test.mjs --test-name-pattern "SHACL"
```

Expected: FAIL because the SHACL adapter module and `validateSemanticSource` export do not exist.

- [ ] **Step 3: Implement the local RDF/JS dataset factory**

Create `src/shacl-adapter.mjs` with this implementation shape:

```js
import { DataFactory, Store } from "n3";
import SHACLValidator from "rdf-validate-shacl";

const SH = "http://www.w3.org/ns/shacl#";
const MAX_DIAGNOSTICS = 1_000;
const factory = { ...DataFactory, dataset: (quads = []) => new Store(quads) };

function diagnosticCode(term) {
  const value = term?.value ?? SH + "ConstraintComponent";
  const local = value.startsWith(SH) ? value.slice(SH.length) : "ConstraintComponent";
  return "SHACL_" + local.replace(/ConstraintComponent$/, "").replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
}

function simplePointer(term) {
  if (!term) return [];
  const value = term.value;
  const separator = Math.max(value.lastIndexOf("#"), value.lastIndexOf("/"));
  const local = value.slice(separator + 1);
  return ["/" + local.replaceAll("~", "~0").replaceAll("/", "~1")];
}

export async function validateShaclDataset(dataDataset, shapesDataset) {
  const validator = new SHACLValidator(shapesDataset, {
    factory,
    maxErrors: MAX_DIAGNOSTICS,
    importGraph: async () => {
      throw new Error("SHACL graph imports are not allowed");
    }
  });
  const report = await validator.validate(dataDataset);
  if (report.results.length > MAX_DIAGNOSTICS) throw new RangeError("SHACL_DIAGNOSTIC_LIMIT");
  const diagnostics = report.results.map((result) => ({
    code: result.path && result.path.termType !== "NamedNode"
      ? "SHACL_PATH_UNSUPPORTED"
      : diagnosticCode(result.sourceConstraintComponent),
    rule: result.sourceShape?.value ?? result.sourceConstraintComponent?.value ?? "",
    target: result.focusNode?.value ?? "",
    paths: result.path && result.path.termType !== "NamedNode" ? [] : simplePointer(result.path),
    detail: Array.isArray(result.message)
      ? result.message.map((message) => message.value).sort().join("; ")
      : result.message?.value ?? ""
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return { conforms: report.conforms, diagnostics };
}
```

- [ ] **Step 4: Wire source loading to the adapter without leaking the store**

In `src/contract-layer.mjs`, add `import { validateShaclDataset } from "./shacl-adapter.mjs";` next to the N3 imports, retrieve the private store from `datasets`, load a shape string or data-only graph into another private store with `loadSemanticSource`, and add:

```js
export async function validateSemanticSource(source, shapesInput) {
  const dataDataset = datasets.get(source);
  if (!dataDataset) throw new TypeError("Semantic Source was not loaded by loadSemanticSource");
  const shapesSource = loadSemanticSource(shapesInput);
  return validateShaclDataset(dataDataset, datasets.get(shapesSource));
}
```

Map an import failure to `SHACL_IMPORT_FORBIDDEN` and a diagnostic overflow to `SHACL_DIAGNOSTIC_LIMIT` instead of exposing an exception or a validator report to callers.

- [ ] **Step 5: Add valid and unsupported-path coverage**

Extend the SHACL test with a `c:name "Orders"` data graph and assert `{ conforms: true, diagnostics: [] }`. Add a shape using a non-simple path and assert a stable `SHACL_PATH_UNSUPPORTED` diagnostic rather than a guessed pointer.

- [ ] **Step 6: Run SHACL-focused and complete tests**

Run:

```powershell
node --test test/contract-layer.test.mjs --test-name-pattern "SHACL"
node --test test/contract-layer.test.mjs
```

Expected: the SHACL cases and all Contract Layer tests pass; repeated validation produces byte-identical JSON and no network request.

- [ ] **Step 7: Commit the SHACL adapter**

```powershell
git add src/shacl-adapter.mjs src/contract-layer.mjs test/contract-layer.test.mjs
git commit -m "feat: normalize structural SHACL diagnostics"
```


---

### Task 4: Route Contract Layer acceptance lookups through DatasetCore

**Files:**
- Modify: `src/contract-acceptance.mjs`
- Modify: `test/contract-acceptance.test.mjs`

**Interfaces:**
- `contract-acceptance.mjs` imports `matchSemanticSource` and uses it for declaration, list, extension, reference, and Mocking Source lookups.
- `createAcceptanceService` still returns the same verification, effective model, generated client, HTTP/JSON, SQLite, mocking, conformance, and compatibility fields.

- [ ] **Step 1: Establish the green regression baseline**

Run:

```powershell
node --test test/contract-acceptance.test.mjs test/contract-layer.test.mjs
```

Expected: all current acceptance and Contract Layer tests pass before the caller refactor. The new DatasetCore path is covered by the failing/green tests in Task 2; this task changes only the lookup implementation.

- [ ] **Step 2: Replace the acceptance module's array lookup helper**

Change the import and lookup helper to:

```js
import { inspectSemanticSource, loadSemanticSource, matchSemanticSource } from "./contract-layer.mjs";

function objects(source, subject, predicate) {
  return matchSemanticSource(source, { subject, predicate }).map(({ object }) => object);
}
```

Change the functions that currently accept graph arrays (`listValues`, `extensionNodesFor`, `findDeclarationField`, `projectModelFrom`, `verifyProjectContract`, and `parseMockingSource`) to accept the loaded source object and call `objects(source, ...)` or `matchSemanticSource(source, ...)`. Keep public DTO values and all existing diagnostic sorting unchanged.

- [ ] **Step 3: Preserve list and extension semantics using DatasetCore.match**

Use this shape for list traversal:

```js
function listValues(source, head) {
  const values = [];
  let current = head;
  while (current && current !== RDF_NIL) {
    const first = objects(source, current, RDF_FIRST)[0];
    if (!first) break;
    values.push(first);
    current = termValue(objects(source, current, RDF_REST)[0]);
  }
  return values;
}
```

Keep the existing cycle/resource checks and extension-node traversal behavior; only the graph lookup mechanism changes.

- [ ] **Step 4: Run the complete acceptance suite**

Run:

```powershell
node --test test/contract-acceptance.test.mjs test/contract-layer.test.mjs
```

Expected: all existing acceptance and Contract Layer tests pass, including exact decimal preservation, CRUD routes, continuation tokens, Mocking Source separation, conformance, and compatibility reports.

- [ ] **Step 5: Commit the acceptance integration**

```powershell
git add src/contract-acceptance.mjs test/contract-acceptance.test.mjs
git commit -m "refactor: use RDF/JS matching in acceptance seam"
```


---

### Task 5: Add resource-limit and malformed-input coverage

**Files:**
- Modify: `src/contract-layer.mjs`
- Modify: `src/shacl-adapter.mjs`
- Modify: `test/contract-layer.test.mjs`

**Interfaces:**
- `inspectSemanticSource` reports `SOURCE_BYTES_LIMIT` and `QUAD_COUNT_LIMIT` as blocking diagnostics rather than misclassifying them as syntax errors.
- `validateSemanticSource` reports `SHACL_IMPORT_FORBIDDEN`, `SHACL_PATH_UNSUPPORTED`, and `SHACL_DIAGNOSTIC_LIMIT` as stable data-only diagnostics.

- [ ] **Step 1: Add failing boundary tests**

Add:

```js
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
```

- [ ] **Step 2: Run the new tests and verify they fail for the expected reason**

Run:

```powershell
node --test test/contract-layer.test.mjs --test-name-pattern "ceiling|over the quad"
```

Expected: FAIL because the loader currently maps every thrown error to `SOURCE_SYNTAX_INVALID` and does not enforce both ceilings.

- [ ] **Step 3: Map existing source-limit errors in inspection**

Use the `SourceLimitError` and `sourceLimit` helpers introduced in Task 2. In `inspectSemanticSource`, map `SourceLimitError` to `{ code: error.code }` and retain `SOURCE_SYNTAX_INVALID` only for parser errors. The loader already enforces `SOURCE_LIMITS.maxBytes` before parsing and `SOURCE_LIMITS.maxQuads` before constructing the store; this step makes those failures observable with their stable codes.

- [ ] **Step 4: Enforce SHACL result limits and forbidden imports**

Set the pinned validator's `maxErrors` to `SOURCE_LIMITS.maxDiagnostics`, reject every import callback, and convert overflow/import errors to the stable diagnostics named by the interface. Do not include stack traces, validator reports, or package objects in the returned value.

- [ ] **Step 5: Run all tests and inspect diagnostics**

Run:

```powershell
node --test test/contract-layer.test.mjs test/contract-acceptance.test.mjs
```

Expected: all tests pass, resource-limit failures have stable codes, and existing syntax-invalid diagnostics remain unchanged for malformed Turtle.

- [ ] **Step 6: Commit the safety boundaries**

```powershell
git add src/contract-layer.mjs src/shacl-adapter.mjs test/contract-layer.test.mjs
git commit -m "feat: enforce RDF source and validation limits"
```


---

### Task 6: Verify the complete migration and prepare the issue handoff

**Files:**
- Inspect: `AGENTS.md`
- Inspect: `CONTEXT.md`
- Inspect: `docs/adr/0006-fuentes-rdf-por-aspecto.md`
- Inspect: `docs/adr/0009-vinculo-ejecutable-fuente-visual-modulo.md`
- Inspect: `docs/research/rdf-ecosystem-evaluation.md`
- Inspect: `package.json`
- Inspect: `package-lock.json`
- Inspect: `src/contract-layer.mjs`
- Inspect: `src/contract-acceptance.mjs`
- Inspect: `src/shacl-adapter.mjs`
- Inspect: `test/contract-layer.test.mjs`
- Inspect: `test/contract-acceptance.test.mjs`

**Interfaces:**
- No new interface. This task proves the issue acceptance criteria and prepares a reviewable branch.

- [ ] **Step 1: Run the full fresh test and audit commands**

Run:

```powershell
npm ci --ignore-scripts
npm test
npm audit --omit=dev --audit-level=high
```

Expected: clean install, 0 test failures, and no high or critical audit findings.

- [ ] **Step 2: Check repository and branch safety**

Run:

```powershell
git status --short
git diff --check origin/main...HEAD
git diff --name-only origin/main...HEAD
```

Expected: only the design/plan docs, package metadata, RDF/SHACL source, and their tests appear. No `prototypes/`, `samples/`, Visual Source, generated, or unrelated files appear.

- [ ] **Step 3: Review the public boundary manually**

Run:

```powershell
rg -n 'from "n3"|from "rdf-validate-shacl"|new Parser|new Store|\.match\(|new Writer|WeakMap|PROJECT_SEMANTIC_SOURCE|Visual|fetch|Comunica|rdf-ext' src test package.json
```

Confirm that package imports stay in the RDF/SHACL implementation, no network loader or reasoning engine exists, Visual Source code is untouched, and public results contain DTO terms only.

- [ ] **Step 4: Update the issue with resolution evidence**

Post an English comment on issue #40 containing:

```markdown
## Resolution

Implemented the approved RDF/JS migration on `feature/rdfjs-migration`.

- N3 `2.7.12` now handles strict Turtle parsing, RDF/JS terms, `DatasetCore` matching, and Turtle serialization behind the existing data-only seam.
- `rdf-validate-shacl` `0.6.5` is adapted to deterministic Talby diagnostics without network imports or package objects in public results.
- Existing Contract Layer and acceptance behavior remains covered, with round-trip, term, blank-node, list, extension, resource-limit, and SHACL conformance tests.
- No Comunica, `rdf-ext`, Visual Source binding, prototype, external adapter, or unrelated public-contract change was added.

Verification: `npm test`; `npm audit --omit=dev --audit-level=high`.
```

Because this issue has associated repository changes, keep #40 open until a pull request is reviewed and merged; do not close it directly.

- [ ] **Step 5: Leave the branch ready for review**

Run:

```powershell
git status --short
git log --oneline --decorate -8
```

Expected: the working tree is clean, all implementation commits are on `feature/rdfjs-migration`, and the issue handoff identifies the verification commands and remaining PR integration step.
