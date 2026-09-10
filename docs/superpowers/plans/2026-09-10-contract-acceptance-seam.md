# Contract Acceptance Seam Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a disposable browser-only probe that makes the public acceptance seam visible from a Turtle fixture through logical verification, a TypeScript-client boundary, an HTTP/JSON mock, logical SQLite state, conformance vectors, and a compatibility report.

**Architecture:** Keep one pure logical module inside a self-contained HTML file and keep DOM rendering in a thin wrapper. The module owns immutable-style state transitions, source fixtures, logical adapters, HTTP responses, reports, and guided walkthrough definitions; the renderer only dispatches actions and displays complete relevant state. The prototype deliberately uses labeled logical adapters instead of production libraries or persistence.

**Tech Stack:** Vanilla HTML, CSS, and JavaScript in one file; no package manager, runtime dependency, server, database, or test framework.

## Global Constraints

- Create only `prototypes/contract-acceptance-seam/index.html` and its prototype-local `.gitignore`; do not modify production code or root commands.
- Keep the prototype disposable, runnable by double-click, dependency-free, and independent of every other prototype.
- Preserve the approved terms and literals `Cliente`, `Proyecto`, `Periodo`, `AprobarProyecto`, `fin >= inicio`, `Declaration Identifier`, `Prototype Profile`, and `X-Test-Actor`.
- Label Turtle, verification, TypeScript-client, HTTP/mock, and SQLite stages as logical adapters; do not imply that the prototype runs those production technologies.
- Keep exact decimals as strings, normalize before validation, reject unknown input fields, tolerate extra response properties, and preserve absence versus `null`.
- Show declared/default/derived origin internally, but never include origin metadata, permissions, or API metadata in HTTP payloads.
- Keep source loading explicit; never fetch an IRI or make a network request.
- Use the existing HTTP/JSON error shape with status, Problem Details members, and the `errors` extension with stable codes and JSON Pointer paths.
- Treat continuation tokens as opaque and reject invalid binding or mixed offset/token pagination.
- Keep the guided walkthroughs as the runnable check; add no separate test suite, fixture runner, or root-level command.
- Every commit created by this plan contains one independently reviewable prototype increment and uses an English commit message.

---

### Task 1: Scaffold the isolated prototype page

**Files:**
- Create: `prototypes/contract-acceptance-seam/.gitignore`
- Create: `prototypes/contract-acceptance-seam/index.html`

**Interfaces:**
- Produces the page shell and DOM targets consumed by Tasks 2–5.
- Does not import or reference `prototypes/http-contract-probe`, `prototypes/rdf-shacl`, or any other prototype.

- [ ] **Step 1: Add prototype-local ignore rules**

Write the smallest local ignore file:

```gitignore
# Disposable browser-prototype artifacts
*.log
results/
```

- [ ] **Step 2: Add the page shell**

Create `index.html` with these sections and IDs:

```html
<main>
  <header>
    <p class="eyebrow">Disposable prototype · contract acceptance seam</p>
    <h1>Contract acceptance seam</h1>
    <p id="scope"></p>
  </header>
  <section aria-labelledby="state-title">
    <h2 id="state-title">Current state</h2>
    <div id="state"></div>
    <pre id="last-request"></pre>
    <pre id="last-response"></pre>
    <pre id="incidents"></pre>
  </section>
  <section aria-labelledby="free-play-title">
    <h2 id="free-play-title">Free exploration</h2>
    <div id="free-play"></div>
  </section>
  <section aria-labelledby="walkthrough-title">
    <h2 id="walkthrough-title">Guided walkthroughs</h2>
    <div id="walkthroughs"></div>
  </section>
</main>
<script>
  "use strict";
  // Tasks 2–5 add the logical module and renderer.
</script>
```

Use accessible labels, keyboard-focusable buttons, readable contrast, and
`aria-live="polite"` for the last response and report areas. Keep styling
minimal and reuse the existing prototype visual pattern: cards, tables, tabs,
and readable JSON blocks.

- [ ] **Step 3: Run the page manually**

Run:

```powershell
Start-Process (Resolve-Path 'prototypes/contract-acceptance-seam/index.html')
```

Expected: the page opens without a console or network dependency and shows the
four empty sections.

- [ ] **Step 4: Commit the scaffold**

```powershell
git add -- prototypes/contract-acceptance-seam/.gitignore prototypes/contract-acceptance-seam/index.html
git commit -m "prototype: scaffold contract acceptance seam"
```

### Task 2: Add source fixtures, verification, and the effective-model view

**Files:**
- Modify: `prototypes/contract-acceptance-seam/index.html` inside the single `<script>`

**Interfaces:**
- Produces `ContractAcceptanceProbe.initialState()`.
- Produces `ContractAcceptanceProbe.reduce(state, action)` for `reset`,
  `loadSources`, `verify`, `materialize`, `loadInvalidSource`, and
  `selectActor` actions.
- Produces `ContractAcceptanceProbe.fixtures` and
  `ContractAcceptanceProbe.walkthroughs` for the renderer.

- [ ] **Step 1: Define the source fixture and variants**

Add plain data for one valid source and three decision probes. Keep the Turtle
visible as text; the logical verifier selects the fixture metadata and does not
parse or fetch it:

```js
const fixtures = {
  valid: {
    semanticSource: `@prefix c: <https://github.com/TalbyAI/talby-domain/vocab/contract#> .
@prefix d: <urn:talby:prototype:declaration:> .
d:Project a c:Entity ; c:name "Proyecto" .`,
    mockingSource: `@prefix m: <https://github.com/TalbyAI/talby-domain/vocab/mocking#> .
@prefix s: <urn:talby:prototype:scenario:> .
s:ApproveKnownProject a m:Scenario .`,
    verification: { status: "verified", diagnostics: [] }
  },
  missingReference: { verification: { status: "blocked", diagnostics: [
    { code: "REFERENCE_NOT_FOUND", paths: ["/Proyecto/clienteId"] }
  ] } },
  unsupportedFunction: { verification: { status: "blocked", diagnostics: [
    { code: "FUNCTION_UNSUPPORTED", paths: ["/Proyecto/Periodo"] }
  ] } },
  contradictory: { verification: { status: "blocked", diagnostics: [
    { code: "DECLARATION_CONTRADICTION", paths: ["/Proyecto/importe"] }
  ] } }
};
```

Extend the valid fixture metadata with the minimal effective model: the
`Proyecto` route `/projects`, the `Periodo` assertion, exact-decimal `importe`,
the five derived CRUD operations, `AprobarProyecto`, a declared Event, and
origins for explicit, profile-default, and derived values. Keep the sample
payload fields in the approved project vocabulary.

- [ ] **Step 2: Implement verification and materialization**

Use these exact pure functions inside the module:

```js
function verifySources(fixture) {
  return fixture.verification;
}

function materializeEffectiveModel(fixture) {
  if (fixture.verification.status !== "verified") return null;
  return {
    route: { value: "/projects", origin: "derivado" },
    operations: ["create", "get", "list", "patch", "delete"],
    fields: {
      importe: { type: "ExactDecimal", origin: "declarado" },
      periodo: { rule: "fin >= inicio", origin: "declarado" }
    },
    profileDefaults: { listLimit: { value: 20, origin: "default" } },
    command: { name: "AprobarProyecto", origin: "declarado" },
    event: { name: "ProjectApproved", origin: "declarado" }
  };
}
```

`reduce` must preserve a blocked verification result without creating an
effective model or enabling the client/mock stages. `materialize` may only run
after a successful `verify` action.

- [ ] **Step 3: Add source and effective-model rendering data**

Render source text, source-selection status, verification diagnostics, and each
effective-model origin. Render the literal strings and diagnostic paths as
text content, never as `innerHTML`.

- [ ] **Step 4: Manually check the blocking behavior**

Run the page and use free-play actions for the valid, missing-reference,
unsupported-function, and contradictory variants.

Expected:

- valid source reaches `verified` and shows the effective model;
- each invalid source shows its stable diagnostic and no effective model;
- no client, mock, or storage action is available while verification is blocked.

- [ ] **Step 5: Commit the source and verification increment**

```powershell
git add -- prototypes/contract-acceptance-seam/index.html
git commit -m "prototype: model contract verification seam"
```

### Task 3: Add the TypeScript-client boundary, HTTP/JSON mock, and logical SQLite state

**Files:**
- Modify: `prototypes/contract-acceptance-seam/index.html` inside the logical module and renderer

**Interfaces:**
- `clientRequest(operation, input, state)` returns a plain HTTP request object.
- `executeHttp(state, request)` returns `{ state, response, transition }`.
- `logicalStorage(state)` returns entity state labeled `SQLite (logical adapter)`.
- `normalizeProject(input)` returns `{ value, incidents }`.
- `validateProject(input, mode)` returns an incident list.

- [ ] **Step 1: Add normalization and validation**

Implement only the rules needed by the accepted seam:

```js
function normalizeProject(input) {
  const value = { ...input };
  if (typeof value.nombre === "string") value.nombre = value.nombre.trim();
  return { value, incidents: [] };
}

function validateProject(input, mode = "complete") {
  const incidents = [];
  const known = ["clienteId", "nombre", "periodo", "importe"];
  for (const key of Object.keys(input)) {
    if (!known.includes(key)) incidents.push({
      code: "UNKNOWN_FIELD", paths: [`/${key}`]
    });
  }
  if (mode === "complete" && !input.nombre) incidents.push({
    code: "REQUIRED", paths: ["/nombre"]
  });
  if (input.periodo && input.periodo.fin < input.periodo.inicio) incidents.push({
    code: "PERIOD_END_BEFORE_START",
    paths: ["/periodo/inicio", "/periodo/fin"]
  });
  if (typeof input.importe !== "string") incidents.push({
    code: "EXACT_DECIMAL_STRING_REQUIRED", paths: ["/importe"]
  });
  return incidents;
}
```

Add identifier validation for `[A-Za-z0-9_-]{1,128}` and keep the decimal
value as a string. Normalize before both complete-state and Partial Update
Message validation.

- [ ] **Step 2: Add request and error helpers**

Use the already decided routes and error shape:

```js
function problem(status, code, detail, errors = []) {
  return {
    status,
    headers: { "content-type": "application/problem+json" },
    body: {
      type: `https://talby.ai/problems/${code.toLowerCase()}`,
      title: detail,
      status,
      detail,
      instance: "urn:talby:prototype:request:1",
      errors
    }
  };
}

function clientRequest(operation, input, state) {
  const routes = {
    create: ["POST", "/projects"],
    get: ["GET", `/projects/${input.id}`],
    list: ["GET", "/projects"],
    patch: ["PATCH", `/projects/${input.id}`],
    delete: ["DELETE", `/projects/${input.id}`],
    approve: ["POST", "/projects/commands/AprobarProyecto"]
  };
  const [method, path] = routes[operation];
  return {
    method,
    path,
    headers: { "X-Test-Actor": state.actor },
    query: input.query,
    body: input.body
  };
}
```

Individual success models remain unwrapped. Lists expose `items` and
`pagination`; errors expose Problem Details and `errors`.

- [ ] **Step 3: Implement the logical mock and storage transitions**

Implement `executeHttp` for create, get, list, Partial Update Message, delete,
and `AprobarProyecto`. Use a plain `projects` array as the logical adapter,
return a copied state on successful changes, and leave it unchanged for every
422, 400, 403, or 404 response. Return `201`, `200`, and `204` success
statuses from the accepted HTTP contract.

For pagination, keep a private binding map from representative opaque tokens
to the effective query signature and next index. Show only the opaque token in
the response. Reject offset plus token, unknown tokens, and mismatched query
bindings with `400`.

For storage rendering, expose:

```js
function logicalStorage(state) {
  return {
    adapter: "SQLite (logical adapter)",
    projects: state.projects.map(project => ({ ...project }))
  };
}
```

Add the explicit `ponytail:` comment beside the adapter state to document the
known ceiling: `ponytail: in-memory logical storage; real SQLite belongs to implementation acceptance`.

- [ ] **Step 4: Add actor authorization**

Use fixed actors and required permissions:

```js
const actors = {
  editor: ["projects.read", "projects.write", "projects.approve"],
  reader: ["projects.read"],
  anonymous: []
};
```

Require every permission declared by the operation. Missing or unknown actors
are denied by default. Include required, granted, and missing permissions in
the visible transition state, not in the payload.

- [ ] **Step 5: Manually check the public journey and failure atomicity**

Run the valid walkthrough through create, list, get, patch, and delete. Then
run invalid `Periodo`, unknown field, invalid identifier, mixed pagination, and
invalid token actions.

Expected:

- `trim` is visible before validation;
- `importe` remains a decimal string through request, response, and storage;
- PATCH returns the complete resulting state;
- invalid actions show stable error codes and do not alter stored projects;
- reader and anonymous access are denied where required.

- [ ] **Step 6: Commit the boundary increment**

```powershell
git add -- prototypes/contract-acceptance-seam/index.html
git commit -m "prototype: exercise HTTP and storage acceptance seam"
```

### Task 4: Add Mocking Scenarios, conformance vectors, and compatibility reporting

**Files:**
- Modify: `prototypes/contract-acceptance-seam/index.html` inside the logical module and renderer

**Interfaces:**
- `matchScenarios(operation, count)` returns one of `not-simulated`,
  `matched`, or `ambiguous` with the declared response/error when applicable.
- `runConformance()` returns rows with `input`, `client`, `engine`, and
  `equal` properties.
- `compareSources(before, after)` returns categorized report entries keyed by
  Declaration Identifier.

- [ ] **Step 1: Add stateless scenario matching**

Add three free-play actions that call the same command with zero, one, and two
matching logical scenarios. Return:

```js
{ status: "not-simulated", response: null, error: null }
{ status: "matched", response: { approved: true }, error: null }
{ status: "ambiguous", response: null, error: { code: "SCENARIO_AMBIGUOUS" } }
```

Keep scenario state separate from project storage and show that a Mocking
Source is optional for CRUD.

- [ ] **Step 2: Add independent logical conformance runners**

Use one vector list containing trim, idempotent trim, invalid `Periodo`, exact
decimal string preservation, and an unknown field. Implement separate
`runClientVector` and `runEngineVector` functions that each return normalized
value plus incidents. Do not call one runner from the other. Compare stable
JSON projections:

```js
function conformanceRow(vector) {
  const client = runClientVector(vector);
  const engine = runEngineVector(vector);
  return {
    name: vector.name,
    client,
    engine,
    equal: JSON.stringify(client) === JSON.stringify(engine)
  };
}
```

Render a mismatch as an explicit failure; never hide it behind a pass label.

- [ ] **Step 3: Add the compatibility fixture and comparator**

Represent declarations by stable identifiers, effective route, input rules,
and output fields:

```js
const compatibilityBefore = [
  { id: "decl:project", route: "/projects", input: ["nombre"], output: ["id", "nombre"] }
];
const compatibilityAfter = [
  { id: "decl:project", route: "/projects-v2", input: ["nombre", "clienteId"], output: ["id", "nombre", "estado"] }
];
```

Compare without versions and emit at least:

- `compatible` for an additive response property;
- `potentially-incompatible` for a derived-route move with stable identity;
- `incompatible` for a newly required input field.

Render the Declaration Identifier, category, and concise reason. Do not add
Publication versioning or Breaking Change Approval to the prototype.

- [ ] **Step 4: Add report rendering and manual checks**

Run the conformance and compatibility walkthrough. Expected:

- all approved vectors show equal client and engine results;
- changing one runner's result makes a visible mismatch;
- the compatibility report contains all three categories and preserves the
  stable declaration identity.

- [ ] **Step 5: Commit the reports increment**

```powershell
git add -- prototypes/contract-acceptance-seam/index.html
git commit -m "prototype: add conformance and compatibility reports"
```

### Task 5: Add the complete UI, guided walkthroughs, and accessibility behavior

**Files:**
- Modify: `prototypes/contract-acceptance-seam/index.html`

**Interfaces:**
- `render(state)` redraws every visible state panel from the current state.
- `dispatch(action)` calls `ContractAcceptanceProbe.reduce` and then `render`.
- `walkthroughs` contains exactly four guided flows: valid journey,
  rejection, authorization/mocking, and conformance/compatibility.

- [ ] **Step 1: Render complete relevant state after every action**

Implement `render(state)` so it replaces, rather than appends to, the state
panels. Display:

```js
{
  stage,
  selectedSources,
  verification,
  effectiveModel,
  actor,
  storage: logicalStorage(state),
  lastRequest,
  lastResponse,
  incidents,
  reports
}
```

Use text nodes or `textContent` for source, request, response, and diagnostic
content. Use a table for projects and a tabular or list view for reports.

- [ ] **Step 2: Add free-play controls**

Add buttons for source variants, verify/materialize, actor selection, every
CRUD operation, invalid input cases, pagination variants, `AprobarProyecto`,
scenario counts, conformance, compatibility, and reset. Disable actions that
require a verified effective model until that stage is reached.

- [ ] **Step 3: Add four tabbed guided walkthroughs**

Each walkthrough resets to a known state, shows numbered steps, executes one
step at a time, and displays the complete state after every step. The labels
must identify the expected public result, for example `201`, `422`, `403`,
`400`, `204`, `not simulated`, `ambiguous`, or `equal`.

- [ ] **Step 4: Check accessibility and direct launch**

Use semantic headings, labelled select controls, visible focus styles, button
labels that identify the action, and live regions for responses and reports.
Open the file directly and run all four walkthroughs using only keyboard and
mouse.

- [ ] **Step 5: Commit the completed prototype**

```powershell
git add -- prototypes/contract-acceptance-seam/index.html
git commit -m "prototype: complete contract acceptance walkthroughs"
```

### Task 6: Verify the branch and capture evidence

**Files:**
- Inspect: `docs/superpowers/specs/2026-09-10-contract-acceptance-seam-design.md`
- Inspect: `prototypes/contract-acceptance-seam/index.html`
- Inspect: `prototypes/contract-acceptance-seam/.gitignore`

**Interfaces:**
- No new code interface; this task verifies the artifact against the approved
  design and repository safety rules.

- [ ] **Step 1: Run repository-level static checks**

Run:

```powershell
git diff --check origin/main...HEAD
git status --short
rg -n "fetch\\(|XMLHttpRequest|WebSocket|import |require\\(|sqlite|node_modules" prototypes/contract-acceptance-seam
```

Expected:

- `git diff --check` emits no errors;
- only the prototype files and their commits appear in the branch delta;
- the final search finds no network, package, or real-database dependency.

- [ ] **Step 2: Complete every guided walkthrough**

Open the HTML directly and record the visible result of each walkthrough. The
minimum evidence is: valid journey completed, invalid state preserved, denied
actor shown, zero/one/multiple scenario results shown, all conformance rows
equal, and all three compatibility categories shown.

- [ ] **Step 3: Verify prototype isolation**

Run:

```powershell
git diff --name-only origin/main...HEAD
git status --short
```

Expected: no changes outside the prototype directory and the already committed
design/plan documents; no root build, test, or dependency file changed.

- [ ] **Step 4: Commit only if evidence requires a correction**

If a correction is needed, make the smallest change, rerun the affected
walkthrough, and commit it with:

```powershell
git add -- prototypes/contract-acceptance-seam
git commit -m "prototype: correct acceptance seam evidence"
```

Do not add a separate test framework or production dependency during this
verification task.
