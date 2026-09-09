# Effective Contract Inspector Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a disposable HTML prototype that makes the transition from a loaded source to the effective model inspectable, including CRUD, PATCH, permissions, and derived routes.

**Architecture:** `index.html` will contain the only executable artifact, with a pure data-and-transformation module separated from a thin DOM wrapper. The flow will be source → verify(source) → materialize(source, profile) → inspect(effectiveModel); verification with errors will never produce a partial effective model.

**Tech Stack:** Native HTML, CSS, and JavaScript in one file; no framework, bundler, server, or dependencies.

## Global Constraints

- The prototype will live only in `prototypes/effective-contract-inspector/` and must be removable without modifying another part of the repository.
- The page will open directly by double-clicking and will make no network requests.
- The logic module will not know about `document`, the DOM, or button handlers.
- Every visible element will distinguish declared, default, and derived origins.
- The example model will use `gestion`, `proyectos`, `Proyecto`, `Periodo`, and a decimal amount.
- An entity will derive CRUD only when it explicitly declares `crud: true`; in that case it will derive create, get, list, partial update, and delete.
- PATCH will preserve absent fields, completely replace present groupings, and validate the resulting state.
- An explicit route will replace the derived route; explicit permissions will replace derived permissions.
- Missing references and contradictions will block materialization.
- No separate test suite will be added; checking will be manual through guided walkthroughs and one visible assertion per walkthrough.

---

## File map

- Create: `prototypes/effective-contract-inspector/index.html` — HTML, styles, fixture, pure module, interaction state, and rendering.
- Create: `prototypes/effective-contract-inspector/README.md` — question, scope, and opening command.
- Create: `prototypes/effective-contract-inspector/.gitignore` — common residue for the isolated directory.
- Modify: none — production code is not involved.
- Test: none — the asset is a self-contained manual prototype; its checks live in the interface.

## Task 1: Create the isolated container and empty page

**Files:**
- Create: `prototypes/effective-contract-inspector/.gitignore`
- Create: `prototypes/effective-contract-inspector/README.md`
- Create: `prototypes/effective-contract-inspector/index.html`

**Interfaces:**
- Consumes: none.
- Produces: a page that opens by double-clicking with `#state`, `#free-play`, and `#walkthroughs` containers.

- [ ] **Step 1: Create the disposable branch**

~~~powershell
git switch -c prototype/effective-contract-inspector
~~~

Expected: Switched to a new branch `prototype/effective-contract-inspector`.

- [ ] **Step 2: Write the local `.gitignore`**

Use this exact content:

~~~gitignore
.DS_Store
Thumbs.db
~~~

- [ ] **Step 3: Write the local instructions**

Use this exact content in `README.md`:

~~~markdown
# Prototipo desechable: inspector del modelo efectivo

Pregunta: ¿qué forma permite inspeccionar la fuente cargada, su verificación, los defaults del perfil y los contratos CRUD derivados?

Ticket: [Definir el modelo efectivo y los contratos CRUD derivados](https://github.com/TalbyAI/talby-domain/issues/5)

## Ejecutar

Entrar primero en esta carpeta y abrir index.html con doble clic. No hay dependencias, servidor ni datos persistidos.

## Alcance

La página compara declaraciones, defaults y derivaciones para un servicio pequeño de gestión de proyectos. No ejecuta HTTP, SQLite ni generación real de TypeScript.
~~~

- [ ] **Step 4: Create the minimum HTML structure**

Write `index.html` with this shell:

~~~html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Inspector del modelo efectivo</title>
  <style>
    :root { color-scheme: light; font: 16px/1.5 system-ui, sans-serif; }
    body { margin: 0; background: #f5f7fb; color: #172033; }
    main { width: min(1100px, calc(100% - 32px)); margin: 0 auto; padding: 40px 0 64px; }
    section { margin-top: 24px; padding: 24px; background: #fff; border: 1px solid #dce2ee; border-radius: 12px; }
    button { cursor: pointer; border: 1px solid #b8c4d8; border-radius: 8px; padding: 9px 13px; background: #fff; color: inherit; }
    button:hover, button:focus-visible { border-color: #3457d5; outline: 2px solid #c9d3ff; }
    .accent { color: #3457d5; }
  </style>
</head>
<body>
  <main>
    <header>
      <p class="accent">Prototipo desechable · Definir el modelo efectivo y los contratos CRUD derivados</p>
      <h1>Inspector del modelo efectivo</h1>
      <p>Explora qué está declarado, qué aporta el perfil de prototipo y qué se deriva para CRUD.</p>
    </header>
    <section aria-labelledby="state-title">
      <h2 id="state-title">Estado actual</h2>
      <div id="state"></div>
    </section>
    <section aria-labelledby="free-play-title">
      <h2 id="free-play-title">Exploración libre</h2>
      <div id="free-play"></div>
    </section>
    <section aria-labelledby="walkthrough-title">
      <h2 id="walkthrough-title">Recorridos guiados</h2>
      <div id="walkthroughs"></div>
    </section>
  </main>
  <script>
    "use strict";
  </script>
</body>
</html>
~~~

- [ ] **Step 5: Check the shell**

~~~powershell
Set-Location prototypes/effective-contract-inspector
Start-Process .\index.html
~~~

Expected: the page opens locally and shows the title plus three empty sections.

- [ ] **Step 6: Commit the isolated shell**

~~~powershell
git add prototypes/effective-contract-inspector
git commit -m "prototype: scaffold effective contract inspector"
~~~

## Task 2: Implement the pure source, verification, and materialization model

**Files:**
- Modify: `prototypes/effective-contract-inspector/index.html:script block`

**Interfaces:**
- Consumes: the shell from Task 1.
- Produces: `prototypeProfile`, `sourceFixture(variant)`, `loadSource(variant)`, `verifySource(source)`, and `materialize(source, profile)`.

- [ ] **Step 1: Add the explicit profile and three example sources**

Insert this data before DOM code:

~~~js
const prototypeProfile = Object.freeze({
  id: "prototype-defaults",
  list: Object.freeze({ modes: ["offset", "continuationToken"], defaultMode: "offset", defaultLimit: 20, maxLimit: 100 }),
  route: Object.freeze({ strategy: "module/feature/entity", separator: "/" }),
  permissions: Object.freeze({ pattern: "crud.{entity}.{verb}" }),
  patch: Object.freeze({ absentField: "preserve", presentGroup: "replace", validatesCompleteResult: true, recursiveNestedPatch: false }),
});

function sourceFixture(variant) {
  const explicit = variant === "explicit";
  const invalid = variant === "invalid";
  return {
    sourceId: "projects-" + variant + ".ttl",
    declarations: [
      { id: "module:gestion", kind: "module", name: "gestion" },
      { id: "feature:proyectos", kind: "feature", name: "proyectos", parent: "module:gestion" },
      { id: "entity:cliente", kind: "entity", name: "Cliente", parent: "module:gestion", identifier: "id", fields: [{ name: "id", type: "Identifier" }] },
      { id: "group:periodo", kind: "fieldGroup", name: "Periodo", parent: "entity:proyecto", fields: [{ name: "inicio", type: "Date" }, { name: "fin", type: "Date" }], assertions: ["fin >= inicio"] },
      {
        id: "entity:proyecto",
        kind: "entity",
        name: "Proyecto",
        parent: "feature:proyectos",
        identifier: "id",
        crud: true,
        fields: [
          { name: "id", type: "Identifier" },
          { name: "clienteId", type: "EntityReference", target: invalid ? "entity:cliente-inexistente" : "entity:cliente" },
          { name: "periodo", type: "FieldGroup", target: "group:periodo" },
          { name: "importe", type: "Decimal" },
        ],
        ...(explicit ? { route: "/projects", permissions: { create: ["projects.write"], get: ["projects.read"], list: ["projects.read"], patch: ["projects.write"], delete: ["projects.write"] } } : {}),
        ...(invalid ? { conflicts: [{ property: "crud", values: [true, false] }] } : {}),
      },
    ],
  };
}

function loadSource(variant) {
  return structuredClone(sourceFixture(variant));
}
~~~

- [ ] **Step 2: Add verification with public diagnostics**

~~~js
function verifySource(source) {
  const ids = new Set(source.declarations.map((declaration) => declaration.id));
  const diagnostics = [];
  for (const declaration of source.declarations) {
    if (declaration.kind === "entity" && declaration.crud === true && !(declaration.fields || []).some((field) => field.name === declaration.identifier)) {
      diagnostics.push({ code: "IDENTIFIER_NOT_DECLARED", path: declaration.id + ".identifier", message: "No existe el campo identificador " + declaration.identifier + "." });
    }
    if (declaration.parent && !ids.has(declaration.parent)) {
      diagnostics.push({ code: "PARENT_NOT_FOUND", path: declaration.id, message: "No existe " + declaration.parent + "." });
    }
    for (const field of declaration.fields || []) {
      if (field.target && !ids.has(field.target)) {
        diagnostics.push({ code: "REFERENCE_NOT_FOUND", path: declaration.id + "." + field.name, message: "No existe " + field.target + "." });
      }
    }
    for (const conflict of declaration.conflicts || []) {
      diagnostics.push({ code: "CONTRADICTORY_DECLARATION", path: declaration.id + "." + conflict.property, message: "La propiedad declara valores incompatibles: " + conflict.values.join(" y ") + "." });
    }
  }
  return { ok: diagnostics.length === 0, diagnostics };
}
~~~

- [ ] **Step 3: Add route, permission, and five-operation CRUD derivation**

~~~js
function declarationMap(source) {
  return new Map(source.declarations.map((declaration) => [declaration.id, declaration]));
}

function routeFor(entity, declarations, profile) {
  const segments = [entity.name];
  let current = entity;
  while (current.parent) {
    current = declarations.get(current.parent);
    segments.unshift(current.name);
  }
  const derived = profile.route.separator + segments.join(profile.route.separator);
  return { value: entity.route || derived, origin: entity.route ? "declarado" : "derivado", rule: profile.route.strategy };
}

function permissionFor(entity, verb) {
  return ["crud." + entity.name.toLowerCase() + "." + verb];
}

function crudOperations(entity, route, profile) {
  const collection = route.value;
  const item = collection + "/{" + entity.identifier + "}";
  const definitions = [
    ["create", "POST", collection],
    ["get", "GET", item],
    ["list", "GET", collection],
    ["patch", "PATCH", item],
    ["delete", "DELETE", item],
  ];
  return definitions.map(([verb, method, path]) => ({
    id: entity.id + ":crud:" + verb,
    verb,
    method,
    route: { value: path, origin: route.origin, rule: route.rule },
    permissions: { value: entity.permissions && entity.permissions[verb] || permissionFor(entity, verb), origin: entity.permissions && entity.permissions[verb] ? "declarado" : "derivado" },
    origin: "derivado",
    ...(verb === "list" ? { pagination: { ...profile.list, origin: "default" } } : {}),
    ...(verb === "patch" ? { patch: { ...profile.patch, origin: "default" } } : {}),
  }));
}
~~~

- [ ] **Step 4: Materialize only after valid verification**

~~~js
function materialize(source, profile) {
  const verification = verifySource(source);
  if (!verification.ok) return { effective: null, diagnostics: verification.diagnostics };
  const declarations = declarationMap(source);
  const entity = source.declarations.find((declaration) => declaration.id === "entity:proyecto");
  const route = routeFor(entity, declarations, profile);
  const crudEnabled = entity.crud === true;
  return {
    effective: {
      sourceId: source.sourceId,
      profileId: profile.id,
      declarations: source.declarations.map((declaration) => ({ id: declaration.id, kind: declaration.kind, name: declaration.name, origin: "declarado" })),
      defaults: [
        ...(entity.crud === undefined ? [] : [{ target: entity.id, property: "crud", value: entity.crud, origin: "declarado" }]),
        { target: "crud:list", property: "pagination", value: profile.list, origin: "default" },
        { target: "crud:patch", property: "semantics", value: profile.patch, origin: "default" },
      ],
      operations: crudEnabled ? crudOperations(entity, route, profile) : [],
    },
    diagnostics: [],
  };
}
~~~

- [ ] **Step 5: Check the pure module**

Open `index.html`, then run in DevTools:

~~~js
verifySource(loadSource("valid")).ok === true
materialize(loadSource("valid"), prototypeProfile).effective.operations.length === 5
materialize(loadSource("invalid"), prototypeProfile).effective === null
~~~

Expected: true, true, true. Keep this as an in-page module; do not add a test file.

- [ ] **Step 6: Commit the model layer**

~~~powershell
git add prototypes/effective-contract-inspector/index.html
git commit -m "prototype: derive effective contract model"
~~~

## Task 3: Add the inspector, free exploration, and guided walkthroughs

**Files:**
- Modify: `prototypes/effective-contract-inspector/index.html:script block`

**Interfaces:**
- Consumes: `loadSource`, `verifySource`, `materialize`, and `prototypeProfile` from Task 2.
- Produces: `reduce(state, action)`, readable rendering, free-play buttons, and three scenarios.

- [ ] **Step 1: Add pure state and reducer**

~~~js
const initialState = () => ({ variant: null, source: null, verification: null, materialization: null, lastAction: "Ninguna acción todavía." });

function reduce(state, action) {
  if (action.type === "reset") return initialState();
  if (action.type === "load") return { ...initialState(), variant: action.variant, source: loadSource(action.variant), lastAction: "Cargada la variante " + action.variant + "." };
  if (action.type === "verify" && state.source) {
    const verification = verifySource(state.source);
    return { ...state, verification, materialization: null, lastAction: verification.ok ? "La fuente supera la verificación." : "La verificación encontró bloqueos." };
  }
  if (action.type === "materialize" && state.source) {
    const materialization = materialize(state.source, prototypeProfile);
    return { ...state, verification: verifySource(state.source), materialization, lastAction: materialization.effective ? "Modelo efectivo materializado." : "La materialización está bloqueada." };
  }
  return { ...state, lastAction: "Carga una fuente antes de ejecutar esta acción." };
}
~~~

- [ ] **Step 2: Render complete state in domain language**

Render after every dispatch, using `textContent` for fixture values. Always show Fuente, Etapa, Diagnósticos, Declaraciones, Defaults aplicados, Operaciones derivadas, Ruta, Permisos, PATCH, and Reglas. Add origin badges with exactly declarado, default, or derivado.

Use these DOM-only helpers for the readable state panel:

~~~js
function originBadge(origin) {
  const badge = document.createElement("span");
  badge.textContent = origin;
  badge.dataset.origin = origin;
  return badge;
}

function addLine(parent, label, value, origin) {
  const line = document.createElement("p");
  const labelNode = document.createElement("strong");
  labelNode.textContent = label + ": ";
  line.append(labelNode, document.createTextNode(String(value)));
  if (origin) line.append(" ", originBadge(origin));
  parent.append(line);
}

function render(currentState) {
  const root = document.getElementById("state");
  root.replaceChildren();
  addLine(root, "Fuente", currentState.source ? currentState.source.sourceId : "Ninguna");
  addLine(root, "Etapa", currentState.materialization && currentState.materialization.effective ? "materializada" : currentState.verification ? "verificada" : "cargada");
  addLine(root, "Última acción", currentState.lastAction);
  const diagnostics = currentState.verification ? currentState.verification.diagnostics : [];
  addLine(root, "Diagnósticos", diagnostics.length ? diagnostics.map((item) => item.code).join(", ") : "ninguno");
  const effective = currentState.materialization && currentState.materialization.effective;
  if (!effective) {
    if (currentState.materialization) addLine(root, "Modelo efectivo", "No hay modelo efectivo: la verificación bloquea la materialización.");
    return;
  }
  addLine(root, "Declaraciones", effective.declarations.map((item) => item.name).join(", "), "declarado");
  addLine(root, "Defaults aplicados", effective.defaults.length, "default");
  for (const operation of effective.operations) {
    addLine(root, operation.verb, operation.method + " " + operation.route.value, operation.origin);
    addLine(root, "Ruta", operation.route.value, operation.route.origin);
    addLine(root, "Permisos", operation.permissions.value.join(", "), operation.permissions.origin);
    if (operation.pagination) addLine(root, "Paginación", operation.pagination.modes.join(" | ") + "; default " + operation.pagination.defaultLimit + "; max " + operation.pagination.maxLimit, operation.pagination.origin);
    if (operation.patch) addLine(root, "PATCH", "ausente=conservar; grupo presente=sustituir; valida estado completo", operation.patch.origin);
  }
  addLine(root, "Reglas", "Periodo.fin >= Periodo.inicio; importe decimal exacto", "declarado");
}
~~~

For a valid model, render these five operation rows:

~~~text
Crear       POST   /gestion/proyectos/Proyecto       crud.proyecto.create
Obtener     GET    /gestion/proyectos/Proyecto/{id} crud.proyecto.get
Listar      GET    /gestion/proyectos/Proyecto       offset | continuationToken; default 20; max 100
Actualizar  PATCH  /gestion/proyectos/Proyecto/{id} ausente=conservar; grupo presente=sustituir; valida estado completo
Eliminar    DELETE /gestion/proyectos/Proyecto/{id} crud.proyecto.delete
~~~

For the explicit fixture, show `/projects` and the declared `projects.read` / `projects.write` values. For the invalid fixture, show both diagnostic codes and `No hay modelo efectivo: la verificación bloquea la materialización.`

- [ ] **Step 3: Add always-visible free-play buttons**

~~~js
const freePlayActions = [
  ["Cargar contrato mínimo", { type: "load", variant: "valid" }],
  ["Cargar declaración explícita", { type: "load", variant: "explicit" }],
  ["Cargar contrato inválido", { type: "load", variant: "invalid" }],
  ["Verificar fuente", { type: "verify" }],
  ["Materializar modelo efectivo", { type: "materialize" }],
  ["Reiniciar", { type: "reset" }],
];

let state = initialState();
function dispatch(action) {
  state = reduce(state, action);
  render(state);
}
~~~

The verify and materialize buttons remain visible before a source is loaded; the state panel explains the required precondition.

- [ ] **Step 4: Add the three guided tabs**

~~~js
const scenarios = [
  { id: "crud", title: "CRUD explícitamente habilitado", description: "Una entidad con crud: true declara explícitamente la habilitación y produce cinco operaciones.", steps: [["Cargar fuente", { type: "load", variant: "valid" }], ["Verificar", { type: "verify" }], ["Materializar", { type: "materialize" }]] },
  { id: "explicit", title: "Declaración explícita", description: "Una ruta y permisos escritos sustituyen los valores derivados.", steps: [["Cargar fuente", { type: "load", variant: "explicit" }], ["Verificar", { type: "verify" }], ["Materializar", { type: "materialize" }]] },
  { id: "blocked", title: "Verificación bloqueante", description: "Una referencia inexistente y una contradicción impiden producir un modelo parcial.", steps: [["Cargar fuente", { type: "load", variant: "invalid" }], ["Verificar", { type: "verify" }], ["Intentar materializar", { type: "materialize" }]] },
];
~~~

Starting a scenario first dispatches reset, then its first load action. The next-step button becomes Finalizado after the last action.

- [ ] **Step 5: Add one visible assertion per walkthrough**

~~~js
function scenarioCheck(scenarioId, currentState) {
  if (scenarioId === "crud") {
    const effective = currentState.materialization && currentState.materialization.effective;
    const crud = effective && effective.defaults.find((item) => item.target === "entity:proyecto" && item.property === "crud");
    return Boolean(effective && crud && crud.value === true && crud.origin === "declarado" && effective.operations.length === 5);
  }
  if (scenarioId === "explicit") {
    const operations = currentState.materialization && currentState.materialization.effective ? currentState.materialization.effective.operations : [];
    return operations.length === 5 && operations.every((operation) => operation.route.origin === "declarado" && operation.permissions.origin === "declarado");
  }
  return scenarioId === "blocked" && currentState.materialization && currentState.materialization.effective === null;
}
~~~

Show `Comprobación del recorrido: correcta` or `Comprobación del recorrido: revisar` after the final step. This is the only runnable check; do not create a test runner.

- [ ] **Step 6: Check the interaction manually**

~~~powershell
Set-Location prototypes/effective-contract-inspector
Start-Process .\index.html
~~~

Expected:

- The `CRUD explícitamente habilitado` walkthrough ends with five operations and a correct check.
- The `Declaración explícita` walkthrough ends with `/projects`, declared permissions, and a correct check.
- The `Verificación bloqueante` walkthrough shows `REFERENCE_NOT_FOUND`, `CONTRADICTORY_DECLARATION`, no operations, and a correct check.

- [ ] **Step 7: Commit the interactive inspector**

~~~powershell
git add prototypes/effective-contract-inspector/index.html
git commit -m "prototype: add effective model walkthroughs"
~~~

## Task 4: Capture disposable evidence and hand off the decision

**Files:**
- Modify: `prototypes/effective-contract-inspector/README.md` only if the launch command from Task 1 changes.
- Create: none.

**Interfaces:**
- Consumes: the working HTML and the three manual walkthrough results from Task 3.
- Produces: a throwaway branch commit linked as primary evidence from [Define the effective model and derived CRUD contracts](https://github.com/TalbyAI/talby-domain/issues/5); that ticket remains open until the human confirms the decision.

- [ ] **Step 1: Run the final smoke check**

~~~powershell
Set-Location prototypes/effective-contract-inspector
Start-Process .\index.html
~~~

Click every free-play button once, complete all three tabs, confirm that every action re-renders the full state, and confirm that the browser console has no error.

- [ ] **Step 2: Check isolation and format**

~~~powershell
git diff --check main...HEAD
git status --short
~~~

Expected: no whitespace errors; only the prototype directory is changed on the branch.

- [ ] **Step 3: Capture the commit and context pointer**

~~~powershell
$sha = git rev-parse HEAD
gh issue comment 5 --body "Prototipo de inspección del modelo efectivo: https://github.com/TalbyAI/talby-domain/tree/$sha/prototypes/effective-contract-inspector"
~~~

The comment links the prototype as primary evidence and does not claim that the human decision is closed.

- [ ] **Step 4: Record the human verdict**

After the human has used the prototype, comment the chosen model and its reason on issue 5. Close the issue only when the exchange settles the decision; then append its one-line gist and issue-comment link to Decisions so far on map issue 1.

## Self-review

- Spec coverage: Tasks 2 and 3 cover the source-to-model flow, origin badges, CRUD, PATCH semantics, permissions, routes, defaults, diagnostics, and the three scenarios; Task 4 covers isolation and evidence capture.
- Completeness scan: every implementation step has concrete files, interfaces, code or commands, and expected observations.
- Type consistency: `loadSource` returns a source fixture; `verifySource` returns `{ ok, diagnostics }`; `materialize` returns `{ effective, diagnostics }`; `reduce` stores those exact values; `scenarioCheck` reads the exact `effective.operations`, `route.origin`, `permissions.origin`, and `effective === null` fields produced by materialization.
