import { createCipheriv, createHash } from "node:crypto";
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

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function projectListFingerprint(filters = []) {
  return createHash("sha256")
    .update(canonicalJson({
      filters,
      operation: "urn:talby:contract:proyecto/operation/list",
      ordering: [{ direction: "asc", field: "urn:talby:contract:projectId", nulls: "last", tieBreaker: true }],
      scope: { resource: "urn:talby:contract:proyecto", tenant: null }
    }), "utf8")
    .digest("base64url");
}

function canonicalContinuationToken({ key, now, fingerprint, position = 1, exp = now + 1000, payload: payloadOverride = null }) {
  const encodedHeader = Buffer.from(JSON.stringify({ typ: "continuation+jwe", alg: "dir", enc: "A256GCM", kid: "local" })).toString("base64url");
  const iv = Buffer.alloc(12, 9);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(encodedHeader));
  const payload = payloadOverride ?? { version: 1, operation: "list", iat: now, exp, fingerprint, position };
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final()
  ]);
  return [encodedHeader, "", iv.toString("base64url"), ciphertext.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

test("materializes the project effective model with origins and Module ownership", () => {
  const service = editorService();

  assert.equal(service.verification.status, "verified");
  assert.deepEqual(Object.keys(service).sort(), [
    "client", "close", "compareCompatibility", "conformance", "effectiveModel", "execute",
    "generatedClientSource", "matchScenarios", "mockingSource", "source", "storage", "verification"
  ]);
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
  assert.match(generated, /export function createProjectClient/);
  assert.match(generated, /trim\(\)/);
  assert.match(generated, /export function validateProjectInput/);
  assert.match(generated, /EXACT_DECIMAL_STRING_REQUIRED/);
  for (const field of ["clienteId", "nombre", "periodo", "importe"]) {
    assert.match(generated, new RegExp(`complete \\|\\| Object\\.hasOwn\\(input, "${field}"\\)`));
  }
  assert.match(generated, /IDENTIFIER_INVALID/);
  assert.match(generated, /GROUP_REQUIRED/);
  assert.match(generated, /DATE_INVALID/);
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

test("preserves absence and null as distinct presence incidents", () => {
  const service = editorService();
  const missing = service.client.createProject(validProject({ periodo: undefined }));
  const nullable = service.client.createProject(validProject({ periodo: null }));

  assert.ok(missing.body.issues.some(({ code, paths }) => code === "REQUIRED" && paths.includes("/periodo")));
  assert.ok(!missing.body.issues.some(({ code, paths }) => code === "NULL_NOT_ALLOWED" && paths.includes("/periodo")));
  assert.ok(nullable.body.issues.some(({ code, paths }) => code === "NULL_NOT_ALLOWED" && paths.includes("/periodo")));
  service.close();
});

test("blocks an invalid Semantic Source before opening the acceptance service", () => {
  const result = createAcceptanceService({
    semanticSource: `${PROJECT_SEMANTIC_SOURCE}
      <urn:talby:contract:project> <https://github.com/TalbyAI/talby-domain/vocab/contract#unknown> "x" .
      <urn:talby:contract:module> <https://github.com/TalbyAI/talby-domain/vocab/contract#unknown> "y" .`
  });

  assert.equal(result.verification.status, "blocked");
  assert.equal(result.effectiveModel, null);
  assert.equal(result.client, null);
  assert.ok(result.verification.diagnostics.some(({ code }) => code === "UNKNOWN_PROPERTY"));
  assert.deepEqual(result.verification.diagnostics.map(({ target }) => target), ["urn:talby:contract:module", "urn:talby:contract:project"]);
});

test("denies missing and insufficient Test Actors while exposing the transition only outside the payload", () => {
  const service = editorService();
  service.client.createProject(validProject());

  const readerCreate = service.execute({
    method: "POST",
    path: "/projects",
    headers: { "X-Test-Actor": "reader" },
    body: validProject({ nombre: "Reader Project" })
  });
  const missingActor = service.execute({ method: "GET", path: "/projects/project-1", headers: {} });
  const readerGet = service.execute({ method: "GET", path: "/projects/project-1", headers: { "X-Test-Actor": "reader" } });

  assert.equal(readerCreate.status, 403);
  assert.deepEqual(readerCreate.body.issues, []);
  assert.deepEqual(readerCreate.transition.missing, ["projects.write"]);
  assert.equal(missingActor.status, 403);
  assert.equal(readerGet.status, 200);
  service.close();
});

test("uses authenticated continuation tokens and rejects mixed, manipulated, and expired requests", () => {
  let now = 1_800_000_000_000;
  let randomValue = 0;
  const service = editorService({
    clock: () => now,
    randomBytes: (size) => Buffer.alloc(size, ++randomValue),
    tokenTtlMs: 1000
  });
  service.client.createProject(validProject());
  service.client.createProject(validProject({ nombre: "Project Beta" }));

  const first = service.client.listProjects({ offset: 0, limit: 1 });
  const token = first.body.pagination.continuationToken;
  const tamperedParts = token.split(".");
  tamperedParts[4] = `${tamperedParts[4][0] === "A" ? "B" : "A"}${tamperedParts[4].slice(1)}`;
  assert.equal(first.status, 200);
  assert.equal(token.split(".").length, 5);
  assert.equal(service.client.listProjects({ offset: 0, continuationToken: token }).status, 400);
  assert.equal(service.client.listProjects({ continuationToken: tamperedParts.join(".") }).body.code, "INVALID_CONTINUATION_TOKEN");
  assert.equal(service.client.listProjects({ continuationToken: token, clienteId: "cliente-2" }).body.code, "INVALID_CONTINUATION_TOKEN");

  const second = service.client.listProjects({ continuationToken: token, limit: 2 });
  assert.equal(second.status, 200);
  assert.deepEqual(second.body.items.map(({ id }) => id), ["project-2"]);
  now += 1001;
  assert.equal(service.client.listProjects({ continuationToken: token }).body.code, "INVALID_CONTINUATION_TOKEN");
  service.close();
});

test("accepts continuation tokens using the canonical request schema", () => {
  const now = 1_800_000_000_000;
  const tokenSecret = Buffer.alloc(32, 7);
  const service = editorService({ clock: () => now, tokenSecret });
  service.client.createProject(validProject());
  service.client.createProject(validProject({ nombre: "Project Beta" }));

  const result = service.client.listProjects({ continuationToken: canonicalContinuationToken({
    key: tokenSecret,
    now,
    fingerprint: projectListFingerprint()
  }) });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.items.map(({ id }) => id), ["project-2"]);
  service.close();
});

test("rejects continuation tokens with incomplete or inconsistent payloads", () => {
  const now = 1_800_000_000_000;
  const tokenSecret = Buffer.alloc(32, 7);
  const service = editorService({ clock: () => now, tokenSecret });
  service.client.createProject(validProject());
  service.client.createProject(validProject({ nombre: "Project Beta" }));
  const fingerprint = projectListFingerprint();
  const basePayload = { version: 1, operation: "list", iat: now, exp: now + 1000, fingerprint, position: 1 };
  const payloads = [
    { ...basePayload, exp: undefined },
    { ...basePayload, iat: undefined },
    { ...basePayload, extra: true },
    { ...basePayload, iat: now + 1001 }
  ];

  for (const payload of payloads) {
    const result = service.client.listProjects({ continuationToken: canonicalContinuationToken({ key: tokenSecret, now, fingerprint, payload }) });
    assert.equal(result.body.code, "INVALID_CONTINUATION_TOKEN");
  }
  service.close();
});

test("keeps rejected malformed JSON and invalid pagination requests atomic", () => {
  const service = editorService();
  service.client.createProject(validProject());
  const before = service.storage();

  const malformed = service.execute({
    method: "PATCH",
    path: "/projects/project-1",
    headers: { "X-Test-Actor": "editor" },
    body: "{"
  });
  const mixed = service.client.listProjects({ offset: 0, continuationToken: "not-used" });

  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.code, "MALFORMED_JSON");
  assert.equal(mixed.status, 400);
  assert.equal(mixed.body.code, "PAGINATION_MODE_CONFLICT");
  assert.deepEqual(service.storage(), before);
  service.close();
});

test("maps an unexpected token-boundary failure to a technical Problem Details response", () => {
  const service = editorService({ randomBytes: () => Buffer.alloc(1) });
  service.client.createProject(validProject());
  service.client.createProject(validProject({ nombre: "Project Beta" }));

  const result = service.client.listProjects({ offset: 0, limit: 1 });

  assert.equal(result.status, 500);
  assert.equal(result.body.code, "TECHNICAL_FAILURE");
  assert.equal(result.body.detail, "The request could not be completed");
  service.close();
});

test("keeps Mocking Source separate from CRUD and distinguishes zero, one, and multiple matches", () => {
  const service = editorService();
  service.client.createProject(validProject());
  service.client.createProject(validProject({ nombre: "Project Beta" }));

  assert.deepEqual(service.matchScenarios("AprobarProyecto", { id: "project-2" }), { status: "not-simulated", response: null, error: null });
  assert.deepEqual(service.client.approveProject("project-1").body, { approved: true });
  assert.equal(service.client.approveProject("project-2").body.code, "NOT_SIMULATED");
  assert.equal(service.storage().projects.length, 2);
  service.close();

  const ambiguous = editorService({ mockingSource: `
    @prefix m: <https://github.com/TalbyAI/talby-domain/vocab/mocking#> .
    @prefix d: <urn:scenario:> .
    d:first a m:Scenario ; m:operation "AprobarProyecto" ; m:condition "true" ; m:response "{\\"approved\\":true}" .
    d:second a m:Scenario ; m:operation "AprobarProyecto" ; m:condition "true" ; m:response "{\\"approved\\":true}" .
  ` });
  ambiguous.client.createProject(validProject());
  assert.equal(ambiguous.client.approveProject("project-1").body.code, "SCENARIO_AMBIGUOUS");
  ambiguous.close();
});

test("blocks a missing semantic reference and an unsupported Mocking Source", () => {
  const missingReference = createAcceptanceService({
    semanticSource: PROJECT_SEMANTIC_SOURCE.replace("c:targetEntity d:cliente", "c:targetEntity d:missingClient")
  });
  assert.equal(missingReference.verification.status, "blocked");
  assert.equal(missingReference.effectiveModel, null);
  assert.ok(missingReference.verification.diagnostics.some(({ code }) => code === "REFERENCE_NOT_FOUND"));

  const unsupportedMock = createAcceptanceService({
    mockingSource: `
      @prefix m: <https://github.com/TalbyAI/talby-domain/vocab/mocking#> .
      @prefix d: <urn:scenario:> .
      d:scenario a m:Scenario ; m:operation "AprobarProyecto" ; m:condition "unsupported(id)" ; m:response "{}" .
    `
  });
  assert.equal(unsupportedMock.verification.status, "blocked");
  assert.equal(unsupportedMock.effectiveModel, null);
  assert.ok(unsupportedMock.verification.diagnostics.some(({ code }) => code === "FUNCTION_UNSUPPORTED"));

  const extendedMock = editorService({ mockingSource: `
    @prefix m: <https://github.com/TalbyAI/talby-domain/vocab/mocking#> .
    @prefix d: <urn:scenario:> .
    d:scenario a m:Scenario ; m:operation "AprobarProyecto" ; m:response "{}" ; m:extension [ <urn:custom:note> "inert" ] .
  ` });
  assert.equal(extendedMock.verification.status, "verified");
  extendedMock.close();
});

test("runs independent client and engine conformance vectors", () => {
  const service = editorService();
  const rows = service.conformance();

  assert.ok(rows.length >= 6);
  assert.ok(rows.every((row) => row.equal));
  const decimal = rows.find((row) => row.name === "exact decimal string preservation");
  assert.equal(decimal.client.value.importe, "100.00");
  assert.deepEqual(rows.find((row) => row.name === "invalid Periodo").client.incidents[0].paths, ["/periodo/inicio", "/periodo/fin"]);
  const partialUndefinedId = rows.find((row) => row.name === "partial own undefined id");
  assert.deepEqual(partialUndefinedId.client.incidents, [{ code: "IDENTIFIER_INVALID", rule: "IDENTIFIER_INVALID", paths: ["/id"], detail: "IDENTIFIER_INVALID" }]);
  assert.deepEqual(partialUndefinedId.engine.incidents, partialUndefinedId.client.incidents);
  service.close();
});

test("compares sources by Declaration Identifier without requiring versions", () => {
  const report = serviceCompare([
    { declarationIdentifier: "urn:project", route: "/projects", input: ["nombre"], output: ["id", "nombre"] }
  ], [
    { declarationIdentifier: "urn:project", route: "/projects-v2", input: ["nombre", "clienteId"], output: ["id", "nombre", "estado"] }
  ]);

  assert.equal(report.category, "incompatible");
  assert.ok(report.entries.some(({ category }) => category === "pending review"));
  assert.ok(report.entries.some(({ category }) => category === "incompatible"));
  assert.ok(report.entries.some(({ category }) => category === "compatible"));
});

function serviceCompare(before, after) {
  const service = createAcceptanceService({ actor: "editor", tokenSecret: Buffer.alloc(32, 7) });
  try {
    return service.compareCompatibility(before, after);
  } finally {
    service.close();
  }
}
