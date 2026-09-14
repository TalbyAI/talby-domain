import assert from "node:assert/strict";
import test from "node:test";

import {
  PROJECT_MOCKING_SOURCE,
  PROJECT_SEMANTIC_SOURCE,
  createAcceptanceService,
  generateTypeScriptClient
} from "../src/contract-acceptance.mjs";

function editorService(options = {}) {
  return createAcceptanceService({
    semanticSource: PROJECT_SEMANTIC_SOURCE,
    mockingSource: PROJECT_MOCKING_SOURCE,
    actor: "editor",
    tokenSecret: Buffer.alloc(32, 7),
    ...options
  });
}

function validProject(overrides = {}) {
  return {
    clienteId: "cliente-1",
    nombre: " Proyecto Atlas ",
    periodo: { inicio: "2026-01-01", fin: "2026-12-31" },
    importe: "100.00",
    ...overrides
  };
}

test("materializes the project effective model with origins and Module ownership", () => {
  const service = editorService();

  assert.equal(service.verification.status, "verified");
  assert.equal(service.effectiveModel.declarationIndex["urn:talby:contract:proyecto"].ownerModule, "urn:talby:contract:module");
  assert.equal(service.effectiveModel.declarationIndex["urn:talby:contract:proyecto"].origin, "declared");
  assert.deepEqual(service.effectiveModel.profileDefaults.listLimit, { value: 20, origin: "default" });
  assert.equal(service.effectiveModel.routes.project.value, "/projects");
  assert.equal(service.effectiveModel.routes.project.origin, "derived");
  assert.deepEqual(service.effectiveModel.operations.map(({ name }) => name), ["create", "get", "list", "patch", "delete"]);
  assert.equal(service.effectiveModel.operations[0].origin, "derived");
  assert.equal(service.effectiveModel.fields.importe.type, "ExactDecimal");
  assert.equal(service.effectiveModel.command.name, "AprobarProyecto");
  assert.equal(service.effectiveModel.event.name, "ProjectApproved");
  service.close();
});

test("generates a TypeScript client from the effective public operations", () => {
  const service = editorService();

  const generated = generateTypeScriptClient(service.effectiveModel);

  assert.match(generated, /export interface Proyecto/);
  assert.match(generated, /importe: string/);
  assert.match(generated, /POST \/projects/);
  assert.match(generated, /PATCH \/projects\/{id}/);
  service.close();
});

test("creates a project through the client with trim and exact decimal preservation", () => {
  const service = editorService();

  const result = service.client.createProject(validProject());

  assert.equal(result.status, 201);
  assert.equal(result.body.nombre, "Proyecto Atlas");
  assert.equal(result.body.importe, "100.00");
  assert.equal(typeof result.body.importe, "string");
  assert.deepEqual(service.storage().projects, [{
    id: "project-1",
    clienteId: "cliente-1",
    nombre: "Proyecto Atlas",
    periodo: { inicio: "2026-01-01", fin: "2026-12-31" },
    importe: "100.00"
  }]);
  service.close();
});

test("supports get, offset list, complete-state patch, and delete", () => {
  const service = editorService();
  service.client.createProject(validProject());
  service.client.createProject(validProject({ nombre: " Proyecto Beta ", importe: "200.00" }));

  assert.equal(service.client.getProject("project-1").status, 200);
  const listed = service.client.listProjects({ offset: 0, limit: 1 });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.items.length, 1);
  assert.equal(listed.body.items[0].id, "project-1");

  const patched = service.client.patchProject("project-1", { nombre: " Renamed " });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.nombre, "Renamed");
  assert.deepEqual(patched.body.periodo, { inicio: "2026-01-01", fin: "2026-12-31" });

  assert.equal(service.client.deleteProject("project-1").status, 204);
  assert.deepEqual(service.storage().projects.map(({ id }) => id), ["project-2"]);
  service.close();
});

test("rejects invalid input atomically with structured JSON Pointer incidents", () => {
  const service = editorService();
  const created = service.client.createProject(validProject());
  const before = service.storage();

  const result = service.client.patchProject(created.body.id, {
    nombre: " ",
    periodo: { inicio: "2026-12-31", fin: "2026-01-01" },
    importe: 100,
    extra: true
  });

  assert.equal(result.status, 422);
  assert.equal(result.headers["content-type"], "application/problem+json");
  assert.ok(result.body.issues.some((issue) => issue.code === "UNKNOWN_FIELD" && issue.paths.includes("/extra")));
  assert.ok(result.body.issues.some((issue) => issue.code === "PERIOD_END_BEFORE_START"));
  assert.ok(result.body.issues.some((issue) => issue.code === "EXACT_DECIMAL_STRING_REQUIRED"));
  assert.deepEqual(service.storage(), before);
  service.close();
});

test("blocks an invalid Semantic Source before opening the acceptance service", () => {
  const result = createAcceptanceService({
    semanticSource: `${PROJECT_SEMANTIC_SOURCE}\n<urn:talby:contract:project> <https://github.com/TalbyAI/talby-domain/vocab/contract#unknown> "x" .`
  });

  assert.equal(result.verification.status, "blocked");
  assert.equal(result.effectiveModel, null);
  assert.equal(result.client, null);
  assert.ok(result.verification.diagnostics.some(({ code }) => code === "UNKNOWN_PROPERTY"));
});
