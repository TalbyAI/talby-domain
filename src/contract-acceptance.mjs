import { createCipheriv, createDecipheriv, createHash, randomBytes as secureRandomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import { inspectSemanticSource, loadSemanticSource } from "./contract-layer.mjs";

const CONTRACT = "https://github.com/TalbyAI/talby-domain/vocab/contract#";
const MOCKING = "https://github.com/TalbyAI/talby-domain/vocab/mocking#";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const RDF_FIRST = "http://www.w3.org/1999/02/22-rdf-syntax-ns#first";
const RDF_REST = "http://www.w3.org/1999/02/22-rdf-syntax-ns#rest";
const RDF_NIL = "http://www.w3.org/1999/02/22-rdf-syntax-ns#nil";

const PROJECT = "urn:talby:contract:";

export const PROJECT_SEMANTIC_SOURCE = `@prefix c: <${CONTRACT}> .
@prefix d: <${PROJECT}> .
@prefix xsd: <${XSD}> .

d:module a c:Module ; c:name "Project Management" .
d:cliente a c:Entity ; c:name "Cliente" ; c:parent d:module ; c:field d:clientId ; c:identifierUse d:clientId .
d:clientId a c:Field ; c:name "id" ; c:valueType c:Identifier ; c:required true ; c:nullable false .

d:proyecto a c:Entity ; c:name "Proyecto" ; c:parent d:module ;
    c:field d:projectId, d:projectClientId, d:projectName, d:projectPeriod, d:projectAmount ;
    c:identifierUse d:projectId ; c:defaultCrud true .
d:projectId a c:Field ; c:name "id" ; c:valueType c:Identifier ; c:required true ; c:nullable false .
d:projectClientId a c:Field ; c:name "clienteId" ; c:valueType d:clientReference ; c:required true ; c:nullable false .
d:clientReference a c:EntityReference ; c:targetEntity d:cliente .
d:projectName a c:Field ; c:name "nombre" ; c:valueType xsd:string ; c:normalizers ( c:trim ) ; c:required true ; c:nullable false ; c:minLength 1 .
d:projectPeriod a c:Field ; c:name "periodo" ; c:valueType d:periodo ; c:required true ; c:nullable false .
d:projectAmount a c:Field ; c:name "importe" ; c:valueType c:ExactDecimal ; c:required true ; c:nullable false .

d:periodo a c:FieldGroup ; c:name "Periodo" ; c:field d:periodStart, d:periodEnd ; c:constraint d:periodOrder .
d:periodStart a c:Field ; c:name "inicio" ; c:valueType xsd:date ; c:required true ; c:nullable false .
d:periodEnd a c:Field ; c:name "fin" ; c:valueType xsd:date ; c:required true ; c:nullable false .
d:periodOrder a c:Constraint ; c:expression "fin >= inicio" .

d:approveProject a c:Command ; c:name "AprobarProyecto" ; c:parent d:module ;
    c:field d:approveProjectId ; c:requiresPermission d:approvePermission ; c:allowAnonymous false .
d:approveProjectId a c:Field ; c:name "id" ; c:valueType c:Identifier ; c:required true ; c:nullable false .
d:approvePermission a c:Permission ; c:name "projects.approve" .
d:projectApproved a c:Event ; c:name "ProjectApproved" ; c:parent d:module ; c:field d:projectId .
d:projectCannotApprove a c:BusinessError ; c:module d:module ; c:code "PROJECT_NOT_APPROVABLE" .
`;

export const PROJECT_MOCKING_SOURCE = `@prefix m: <${MOCKING}> .
@prefix xsd: <${XSD}> .
@prefix d: <${PROJECT}> .

d:approveProjectScenario a m:Scenario ;
    m:operation "AprobarProyecto" ;
    m:condition "id == \\"project-1\\"" ;
    m:response "{\\"approved\\":true}"^^xsd:string .
`;

const MOCKING_PREDICATES = new Set([
  RDF_TYPE,
  `${MOCKING}operation`, `${MOCKING}condition`, `${MOCKING}response`, `${MOCKING}error`,
  `${MOCKING}extension`, `${MOCKING}scenario`
]);

const ACTORS = {
  editor: ["projects.read", "projects.write", "projects.approve"],
  reader: ["projects.read"],
  anonymous: []
};

const OPERATION_PERMISSIONS = {
  create: ["projects.write"],
  get: ["projects.read"],
  list: ["projects.read"],
  patch: ["projects.write"],
  delete: ["projects.write"],
  approve: ["projects.approve"]
};

const operationDefinitions = [
  { name: "create", method: "POST", path: "/projects", permission: "projects.write" },
  { name: "get", method: "GET", path: "/projects/{id}", permission: "projects.read" },
  { name: "list", method: "GET", path: "/projects", permission: "projects.read" },
  { name: "patch", method: "PATCH", path: "/projects/{id}", permission: "projects.write" },
  { name: "delete", method: "DELETE", path: "/projects/{id}", permission: "projects.write" }
];

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function termValue(term) {
  return term?.termType === "NamedNode" || term?.termType === "Literal" ? term.value : null;
}

function objects(graph, subject, predicate) {
  return graph
    .filter((triple) => triple.subject.value === subject && triple.predicate.value === predicate)
    .map((triple) => triple.object);
}

function firstObject(graph, subject, predicate) {
  return objects(graph, subject, predicate)[0] ?? null;
}

function listValues(graph, head) {
  const values = [];
  const seen = new Set();
  let current = head?.value;
  while (current && current !== RDF_NIL && !seen.has(current)) {
    seen.add(current);
    const first = firstObject(graph, current, RDF_FIRST);
    if (first) values.push(first);
    current = termValue(firstObject(graph, current, RDF_REST));
  }
  return values;
}

function extensionNodesFor(graph, extensionPredicate) {
  const nodes = new Set();
  const queue = graph
    .filter((triple) => triple.predicate.value === extensionPredicate)
    .map((triple) => triple.object)
    .filter((term) => term.termType === "NamedNode" || term.termType === "BlankNode");
  while (queue.length) {
    const term = queue.shift();
    const key = `${term.termType}:${term.value}`;
    if (nodes.has(key)) continue;
    nodes.add(key);
    for (const triple of graph) {
      if (triple.subject.termType === term.termType && triple.subject.value === term.value && (triple.object.termType === "NamedNode" || triple.object.termType === "BlankNode")) queue.push(triple.object);
    }
  }
  return nodes;
}

function declarationsByKind(model, kind) {
  return Object.values(model.declarationIndex).filter((declaration) => declaration.kind === kind);
}

function declarationByName(model, kind, name) {
  return declarationsByKind(model, kind).find((declaration) => declaration.name === name) ?? null;
}

function issue(code, paths = [], detail = code) {
  return { code, rule: code, paths, detail };
}

function problem(status, code, detail, issues = []) {
  return {
    status,
    headers: { "content-type": "application/problem+json" },
    body: {
      type: `https://talby.ai/problems/${code.toLowerCase()}`,
      title: detail,
      status,
      detail,
      instance: "urn:talby:request:acceptance",
      code,
      category: status >= 500 ? "technical" : status === 403 ? "authorization" : "contract",
      issues
    }
  };
}

function success(status, body = undefined, headers = {}) {
  return { status, headers, body };
}

function withTransition(response, transition) {
  return { ...response, transition };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIdentifier(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function isDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || year > 9999 || month < 1 || month > 12) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

function isDecimal(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 4096
    && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value);
}

function normalizeProject(value) {
  if (!isPlainObject(value)) return value;
  const normalized = clone(value);
  if (typeof normalized.nombre === "string") normalized.nombre = normalized.nombre.trim();
  return normalized;
}

function validatePeriod(period) {
  const issues = [];
  if (!isPlainObject(period)) return [issue("GROUP_REQUIRED", ["/periodo"]), issue("NULL_NOT_ALLOWED", ["/periodo"])];
  if (!isDate(period.inicio)) issues.push(issue("DATE_INVALID", ["/periodo/inicio"]));
  if (!isDate(period.fin)) issues.push(issue("DATE_INVALID", ["/periodo/fin"]));
  if (isDate(period.inicio) && isDate(period.fin) && period.fin < period.inicio) {
    issues.push(issue("PERIOD_END_BEFORE_START", ["/periodo/inicio", "/periodo/fin"], "fin must be greater than or equal to inicio"));
  }
  return issues;
}

function validateProject(value, mode = "complete") {
  const issues = [];
  if (!isPlainObject(value)) return [issue("OBJECT_REQUIRED", [""])];
  const known = new Set(["id", "clienteId", "nombre", "periodo", "importe"]);
  for (const key of Object.keys(value)) if (!known.has(key)) issues.push(issue("UNKNOWN_FIELD", [`/${key}`]));

  if (Object.hasOwn(value, "id") && !isIdentifier(value.id)) issues.push(issue("IDENTIFIER_INVALID", ["/id"]));
  if (mode === "complete" || Object.hasOwn(value, "clienteId")) {
    if (value.clienteId === null || value.clienteId === undefined) issues.push(issue("REQUIRED", ["/clienteId"]));
    else if (!isIdentifier(value.clienteId)) issues.push(issue("IDENTIFIER_INVALID", ["/clienteId"]));
  }
  if (mode === "complete" || Object.hasOwn(value, "nombre")) {
    if (value.nombre === null || value.nombre === undefined) issues.push(issue("REQUIRED", ["/nombre"]));
    else if (typeof value.nombre !== "string" || value.nombre.length < 1) issues.push(issue("MIN_LENGTH", ["/nombre"]));
  }
  if (mode === "complete" || Object.hasOwn(value, "periodo")) {
    if (value.periodo === undefined) issues.push(issue("REQUIRED", ["/periodo"]));
    else if (value.periodo === null) issues.push(issue("NULL_NOT_ALLOWED", ["/periodo"]));
    else issues.push(...validatePeriod(value.periodo));
  }
  if (mode === "complete" || Object.hasOwn(value, "importe")) {
    if (!isDecimal(value.importe)) issues.push(issue("EXACT_DECIMAL_STRING_REQUIRED", ["/importe"]));
  }
  return issues;
}

function parseBody(body) {
  if (body === undefined) return { value: {}, error: null };
  if (typeof body !== "string") return { value: clone(body), error: null };
  try {
    return { value: JSON.parse(body), error: null };
  } catch {
    return { value: null, error: problem(400, "MALFORMED_JSON", "Request body is not valid JSON") };
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isPlainObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function fingerprint(value) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("base64url");
}

function base64urlDecode(value) {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error("Invalid base64url");
  const buffer = Buffer.from(value, "base64url");
  if (buffer.toString("base64url") !== value) throw new Error("Non-canonical base64url");
  return buffer;
}

function encodeToken(header, payload, key, randomBytes) {
  const protectedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const iv = randomBytes(12);
  if (!Buffer.isBuffer(iv) || iv.length !== 12) throw new Error("Continuation IV must be 12 octets");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(protectedHeader));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return [protectedHeader, "", iv.toString("base64url"), ciphertext.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

function decodeToken(token, key, now, expected) {
  try {
    if (typeof token !== "string" || token.split(".").length !== 5) throw new Error("segment count");
    const [encodedHeader, encodedKey, encodedIv, encodedCiphertext, encodedTag] = token.split(".");
    if (encodedKey !== "") throw new Error("encrypted key");
    const header = JSON.parse(base64urlDecode(encodedHeader).toString("utf8"));
    if (header.typ !== "continuation+jwe" || header.alg !== "dir" || header.enc !== "A256GCM" || header.kid !== "local") throw new Error("header");
    const iv = base64urlDecode(encodedIv);
    const ciphertext = base64urlDecode(encodedCiphertext);
    const tag = base64urlDecode(encodedTag);
    if (iv.length !== 12 || tag.length !== 16) throw new Error("length");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(encodedHeader));
    decipher.setAuthTag(tag);
    const payload = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"));
    if (payload.version !== 1 || payload.operation !== expected.operation || payload.fingerprint !== expected.fingerprint) throw new Error("binding");
    if (!Number.isInteger(payload.position) || payload.position < 0 || payload.exp <= now || payload.iat > now + 60_000) throw new Error("payload");
    return payload;
  } catch {
    return null;
  }
}

function projectRequestFingerprint(filters = {}) {
  return fingerprint({
    operation: "list",
    resource: "projects",
    filters,
    ordering: ["id:asc"],
    scope: "default"
  });
}

function openDatabase(databasePath) {
  const database = new DatabaseSync(databasePath ?? ":memory:");
  database.exec("CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, document TEXT NOT NULL)");
  return database;
}

function readProjects(database) {
  return database.prepare("SELECT document FROM projects ORDER BY id ASC").all().map((row) => JSON.parse(row.document));
}

function findDeclarationField(model, graph, entity, fieldName) {
  const fieldIds = objects(graph, entity.declarationIdentifier, `${CONTRACT}field`)
    .filter((term) => term.termType === "NamedNode")
    .map((term) => term.value);
  return fieldIds
    .map((id) => model.declarationIndex[id])
    .find((field) => field?.name === fieldName) ?? null;
}

function projectModelFrom(inspected) {
  const base = inspected.effectiveModel;
  const graph = inspected.source.graph;
  const project = declarationByName(base, "Entity", "Proyecto");
  const client = declarationByName(base, "Entity", "Cliente");
  const period = declarationByName(base, "FieldGroup", "Periodo");
  const command = declarationByName(base, "Command", "AprobarProyecto");
  const event = declarationByName(base, "Event", "ProjectApproved");
  const field = (name) => findDeclarationField(base, graph, project, name);
  const fields = {
    id: { ...field("id"), type: "Identifier", origin: "declared" },
    clienteId: { ...field("clienteId"), type: "EntityReference", origin: "declared" },
    nombre: { ...field("nombre"), type: "string", origin: "declared" },
    periodo: { ...field("periodo"), type: "Nested Inclusion", origin: "declared" },
    importe: { ...field("importe"), type: "ExactDecimal", origin: "declared" }
  };
  const moduleId = declarationByName(base, "Module", "Project Management").declarationIdentifier;
  const operations = operationDefinitions.map((definition) => ({
    ...definition,
    route: definition.path,
    origin: "derived",
    declarationIdentifier: `${project.declarationIdentifier}/operation/${definition.name}`,
    requiredPermissions: [definition.permission]
  }));
  const origins = {
    ...base.origins,
    [`${project.declarationIdentifier}/route`]: "derived",
    [`${project.declarationIdentifier}/operations`]: "derived",
    [`${project.declarationIdentifier}/list-limit`]: "default",
    [`${project.declarationIdentifier}/list-max-limit`]: "default"
  };
  return {
    ...base,
    module: moduleId,
    fields,
    routes: { project: { value: "/projects", origin: "derived" } },
    operations,
    profileDefaults: {
      listLimit: { value: 20, origin: "default" },
      maxListLimit: { value: 100, origin: "default" },
      fieldRequired: { value: true, origin: "default" },
      fieldNullable: { value: false, origin: "default" }
    },
    command: { ...command, name: "AprobarProyecto", origin: "declared", route: "/projects/commands/AprobarProyecto" },
    event: { ...event, name: "ProjectApproved", origin: "declared" },
    reference: { targetEntity: client.declarationIdentifier, origin: "declared" },
    period: { ...period, assertion: "fin >= inicio", origin: "declared" },
    origins
  };
}

function verifyProjectContract(inspected) {
  if (inspected.verification.status !== "verified") return inspected;
  const model = inspected.effectiveModel;
  const graph = inspected.source.graph;
  const diagnostics = [];
  const module = declarationByName(model, "Module", "Project Management");
  const client = declarationByName(model, "Entity", "Cliente");
  const project = declarationByName(model, "Entity", "Proyecto");
  const period = declarationByName(model, "FieldGroup", "Periodo");
  const command = declarationByName(model, "Command", "AprobarProyecto");
  const event = declarationByName(model, "Event", "ProjectApproved");
  if (!module) diagnostics.push(issue("DECLARATION_NOT_FOUND", [], "Project Management Module is required"));
  if (!client) diagnostics.push(issue("DECLARATION_NOT_FOUND", [], "Cliente Entity is required"));
  if (!project) diagnostics.push(issue("DECLARATION_NOT_FOUND", [], "Proyecto Entity is required"));
  if (!period) diagnostics.push(issue("DECLARATION_NOT_FOUND", [], "Periodo grouping is required"));
  if (!command) diagnostics.push(issue("DECLARATION_NOT_FOUND", [], "AprobarProyecto Command is required"));
  if (!event) diagnostics.push(issue("DECLARATION_NOT_FOUND", [], "ProjectApproved Event is required"));
  if (project) {
    const crud = firstObject(graph, project.declarationIdentifier, `${CONTRACT}defaultCrud`);
    if (crud?.value !== "true") diagnostics.push(issue("DEFAULT_CRUD_REQUIRED", [`/${project.declarationIdentifier}`]));
    const identifiers = objects(graph, project.declarationIdentifier, `${CONTRACT}identifierUse`);
    if (identifiers.length !== 1) diagnostics.push(issue("IDENTIFIER_USE_REQUIRED", [`/${project.declarationIdentifier}`]));
    for (const required of ["id", "clienteId", "nombre", "periodo", "importe"]) {
      if (!findDeclarationField(model, graph, project, required)) diagnostics.push(issue("FIELD_NOT_FOUND", [`/${project.declarationIdentifier}/${required}`]));
    }
  }
  if (period) {
    const constraints = objects(graph, period.declarationIdentifier, `${CONTRACT}constraint`)
      .filter((term) => term.termType === "NamedNode")
      .map((term) => firstObject(graph, term.value, `${CONTRACT}expression`)?.value);
    if (!constraints.includes("fin >= inicio")) diagnostics.push(issue("ASSERTION_UNSUPPORTED", [`/${period.declarationIdentifier}`]));
  }
  if (project) {
    const reference = findDeclarationField(model, graph, project, "clienteId");
    const referenceType = reference && termValue(firstObject(graph, reference.declarationIdentifier, `${CONTRACT}valueType`));
    const target = referenceType && termValue(firstObject(graph, referenceType, `${CONTRACT}targetEntity`));
    if (referenceType && (!target || !model.declarationIndex[target])) diagnostics.push(issue("REFERENCE_NOT_FOUND", [`/${project.declarationIdentifier}/clienteId`], "Entity Reference target is not loaded"));
    const amount = findDeclarationField(model, graph, project, "importe");
    if (amount && termValue(firstObject(graph, amount.declarationIdentifier, `${CONTRACT}valueType`)) !== `${CONTRACT}ExactDecimal`) diagnostics.push(issue("DECIMAL_TYPE_REQUIRED", [`/${project.declarationIdentifier}/importe`]));
  }
  for (const expression of graph.filter((triple) => triple.predicate.value === `${CONTRACT}expression`)) {
    if (expression.object.termType === "Literal" && expression.object.value !== "fin >= inicio") diagnostics.push(issue("FUNCTION_UNSUPPORTED", [`/${expression.subject.value}`]));
  }
  const result = diagnostics.length ? {
    ...inspected,
    verification: { status: "blocked", diagnostics: diagnostics.sort((left, right) => left.code.localeCompare(right.code)) },
    effectiveModel: null
  } : inspected;
  return result;
}

function parseMockingSource(input) {
  if (!input) return { status: "verified", diagnostics: [], scenarios: [] };
  let source;
  try {
    source = loadSemanticSource(input);
  } catch (error) {
    return { status: "blocked", diagnostics: [issue("MOCKING_SOURCE_SYNTAX_INVALID", [], error.message)], scenarios: [] };
  }
  const diagnostics = [];
  const extensionNodes = extensionNodesFor(source.graph, `${MOCKING}extension`);
  for (const triple of source.graph) if (!MOCKING_PREDICATES.has(triple.predicate.value) && !extensionNodes.has(`${triple.subject.termType}:${triple.subject.value}`)) diagnostics.push(issue("UNKNOWN_MOCKING_PROPERTY", [`/${triple.subject.value}`]));
  const subjects = [...new Set(source.graph.filter((triple) => triple.predicate.value === `${MOCKING}operation`).map((triple) => triple.subject.value))];
  const scenarios = subjects.map((subject) => {
    const operation = termValue(firstObject(source.graph, subject, `${MOCKING}operation`));
    const condition = termValue(firstObject(source.graph, subject, `${MOCKING}condition`)) ?? "true";
    const response = termValue(firstObject(source.graph, subject, `${MOCKING}response`));
    const error = termValue(firstObject(source.graph, subject, `${MOCKING}error`));
    if (!operation || (response && error) || (!response && !error)) diagnostics.push(issue("MOCK_SCENARIO_CONTRADICTION", [`/${subject}`]));
    if (response) {
      try { JSON.parse(response); } catch { diagnostics.push(issue("MOCK_RESPONSE_INVALID", [`/${subject}`])); }
    }
    if (error) {
      try { JSON.parse(error); } catch { diagnostics.push(issue("MOCK_ERROR_INVALID", [`/${subject}`])); }
    }
    if (condition !== "true" && !/^id\s*==\s*[\"'][^\"']+[\"']$/.test(condition)) diagnostics.push(issue("FUNCTION_UNSUPPORTED", [`/${subject}`]));
    return { subject, operation, condition, response, error };
  });
  return diagnostics.length ? { status: "blocked", diagnostics, scenarios: [] } : { status: "verified", diagnostics: [], scenarios };
}

function scenarioMatches(scenario, input) {
  if (scenario.condition === "true") return true;
  const match = scenario.condition.match(/^id\s*==\s*[\"']([^\"']+)[\"']$/);
  return Boolean(match && input?.id === match[1]);
}

function generatedClientSource(model) {
  return `export interface Periodo { inicio: string; fin: string; }\n`
    + `export interface Proyecto { id: string; clienteId: string; nombre: string; periodo: Periodo; importe: string; }\n`
    + `export interface ProjectClient {\n`
    + `  createProject(input: Omit<Proyecto, "id">): Promise<Proyecto>;\n`
    + `  getProject(id: string): Promise<Proyecto>;\n`
    + `  listProjects(query?: { offset?: number; continuationToken?: string; limit?: number }): Promise<{ items: Proyecto[] }>;\n`
    + `  patchProject(id: string, input: Partial<Omit<Proyecto, "id">>): Promise<Proyecto>;\n`
    + `  deleteProject(id: string): Promise<void>;\n`
    + `  approveProject(id: string): Promise<{ approved: boolean }>;\n`
    + `}\n\n`
    + `export function validateProjectInput(input: Partial<Omit<Proyecto, "id">>, complete = true): string[] {\n`
    + `  const issues: string[] = [];\n`
    + `  const known = ["clienteId", "nombre", "periodo", "importe"];\n`
    + `  for (const key of Object.keys(input)) if (!known.includes(key)) issues.push("UNKNOWN_FIELD:" + key);\n`
    + `  if (complete && !input.clienteId) issues.push("REQUIRED:/clienteId");\n`
    + `  if (complete && !input.nombre) issues.push("REQUIRED:/nombre");\n`
    + `  if (typeof input.nombre === "string" && input.nombre.trim().length < 1) issues.push("MIN_LENGTH:/nombre");\n`
    + `  if (complete && !input.periodo) issues.push("REQUIRED:/periodo");\n`
    + `  if (input.periodo && input.periodo.fin < input.periodo.inicio) issues.push("PERIOD_END_BEFORE_START:/periodo");\n`
    + `  if (complete && (typeof input.importe !== "string" || !/^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$/.test(input.importe))) issues.push("EXACT_DECIMAL_STRING_REQUIRED:/importe");\n`
    + `  return issues;\n}\n\n`
    + `export function createProjectClient(send: (request: { method: string; path: string; query?: unknown; body?: unknown }) => Promise<unknown>): ProjectClient {\n`
    + `  const normalize = <T extends Partial<Omit<Proyecto, "id">>>(input: T) => ({ ...input, ...(typeof input.nombre === "string" ? { nombre: input.nombre.trim() } : {}) });\n`
    + `  const checked = <T>(input: Partial<Omit<Proyecto, "id">>, request: { method: string; path: string; query?: unknown; body?: unknown }, complete: boolean) => { const issues = validateProjectInput(input, complete); return issues.length ? Promise.reject(issues) : send(request) as Promise<T>; };\n`
    + `  return {\n`
    + `    createProject: input => checked<Proyecto>(normalize(input), { method: "POST", path: "${model.routes.project.value}", body: normalize(input) }, true),\n`
    + `    getProject: id => send({ method: "GET", path: \"/projects/\" + id }) as Promise<Proyecto>,\n`
    + `    listProjects: query => send({ method: "GET", path: "${model.routes.project.value}", query }) as Promise<{ items: Proyecto[] }>,\n`
    + `    patchProject: (id, input) => checked<Proyecto>(normalize(input), { method: "PATCH", path: \"/projects/\" + id, body: normalize(input) }, false),\n`
    + `    deleteProject: id => send({ method: "DELETE", path: \"/projects/\" + id }) as Promise<void>,\n`
    + `    approveProject: id => send({ method: "POST", path: "/projects/commands/AprobarProyecto", body: { id } }) as Promise<{ approved: boolean }>\n`
    + `  };\n}\n\n`
    + `// Derived routes: ${model.routes.project.value}, POST /projects/commands/AprobarProyecto\n`
    + `// PATCH /projects/{id} preserves complete-state semantics.\n`;
}

export function generateTypeScriptClient(model) {
  return generatedClientSource(model);
}

export function normalizeProjectForClient(input) {
  return normalizeProject(input);
}

export function validateProjectForClient(input, mode = "complete") {
  return validateProject(input, mode);
}

function engineNormalizeProject(input) {
  if (!isPlainObject(input)) return input;
  const normalized = clone(input);
  if (typeof normalized.nombre === "string") normalized.nombre = normalized.nombre.trim();
  return normalized;
}

function engineValidateProject(value, mode = "complete") {
  const issues = [];
  if (!isPlainObject(value)) return [issue("OBJECT_REQUIRED", [""])];
  const known = ["id", "clienteId", "nombre", "periodo", "importe"];
  for (const key of Object.keys(value)) if (!known.includes(key)) issues.push(issue("UNKNOWN_FIELD", [`/${key}`]));
  if (value.id !== undefined && !isIdentifier(value.id)) issues.push(issue("IDENTIFIER_INVALID", ["/id"]));
  if (mode === "complete" || value.clienteId !== undefined) {
    if (value.clienteId === null || value.clienteId === undefined) issues.push(issue("REQUIRED", ["/clienteId"]));
    else if (!isIdentifier(value.clienteId)) issues.push(issue("IDENTIFIER_INVALID", ["/clienteId"]));
  }
  if (mode === "complete" || value.nombre !== undefined) {
    if (value.nombre === null || value.nombre === undefined) issues.push(issue("REQUIRED", ["/nombre"]));
    else if (typeof value.nombre !== "string" || value.nombre.length < 1) issues.push(issue("MIN_LENGTH", ["/nombre"]));
  }
  if (mode === "complete" || value.periodo !== undefined) {
    if (value.periodo === undefined) issues.push(issue("REQUIRED", ["/periodo"]));
    else if (value.periodo === null) issues.push(issue("NULL_NOT_ALLOWED", ["/periodo"]));
    else if (!isPlainObject(value.periodo)) issues.push(issue("GROUP_REQUIRED", ["/periodo"]));
    else {
      if (!isDate(value.periodo.inicio)) issues.push(issue("DATE_INVALID", ["/periodo/inicio"]));
      if (!isDate(value.periodo.fin)) issues.push(issue("DATE_INVALID", ["/periodo/fin"]));
      if (isDate(value.periodo.inicio) && isDate(value.periodo.fin) && value.periodo.fin < value.periodo.inicio) issues.push(issue("PERIOD_END_BEFORE_START", ["/periodo/inicio", "/periodo/fin"], "fin must be greater than or equal to inicio"));
    }
  }
  if ((mode === "complete" || value.importe !== undefined) && !isDecimal(value.importe)) issues.push(issue("EXACT_DECIMAL_STRING_REQUIRED", ["/importe"]));
  return issues;
}

function clientVector(value) {
  const normalized = normalizeProjectForClient(value);
  return { value: clone(normalized), incidents: validateProjectForClient(normalized) };
}

function engineVector(value) {
  const normalized = engineNormalizeProject(value);
  return { value: clone(normalized), incidents: engineValidateProject(normalized) };
}

const conformanceVectors = [
  {
    name: "trim",
    input: { clienteId: "cliente-1", nombre: " Proyecto Atlas ", periodo: { inicio: "2026-01-01", fin: "2026-12-31" }, importe: "100.00" }
  },
  {
    name: "idempotent trim",
    input: { clienteId: "cliente-1", nombre: "Proyecto Atlas", periodo: { inicio: "2026-01-01", fin: "2026-12-31" }, importe: "100.00" }
  },
  {
    name: "invalid Periodo",
    input: { clienteId: "cliente-1", nombre: "Proyecto Atlas", periodo: { inicio: "2026-12-31", fin: "2026-01-01" }, importe: "100.00" }
  },
  {
    name: "exact decimal string preservation",
    input: { clienteId: "cliente-1", nombre: "Proyecto Atlas", periodo: { inicio: "2026-01-01", fin: "2026-12-31" }, importe: "100.00" }
  },
  {
    name: "unknown field",
    input: { clienteId: "cliente-1", nombre: "Proyecto Atlas", periodo: { inicio: "2026-01-01", fin: "2026-12-31" }, importe: "100.00", extra: true }
  }
];

export function runConformance() {
  return conformanceVectors.map((vector) => {
    const client = clientVector(vector.input);
    const engine = engineVector(vector.input);
    return {
      name: vector.name,
      input: clone(vector.input),
      client,
      engine,
      equal: JSON.stringify(client) === JSON.stringify(engine)
    };
  });
}

function declarationSnapshot(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.declarations)) return value.declarations;
  if (value?.declarationIndex) return Object.values(value.declarationIndex);
  return [];
}

function setDifference(left, right) {
  return left.filter((value) => !right.includes(value));
}

export function compareSources(before, after) {
  const previous = new Map(declarationSnapshot(before).map((entry) => [entry.declarationIdentifier ?? entry.id, entry]));
  const current = new Map(declarationSnapshot(after).map((entry) => [entry.declarationIdentifier ?? entry.id, entry]));
  const entries = [];
  for (const [id, oldEntry] of previous) {
    const newEntry = current.get(id);
    if (!newEntry) {
      entries.push({ declarationIdentifier: id, category: "incompatible", reason: "Declaration was removed." });
      continue;
    }
    const oldRoute = oldEntry.route ?? oldEntry.effectiveRoute;
    const newRoute = newEntry.route ?? newEntry.effectiveRoute;
    if (oldRoute && newRoute && oldRoute !== newRoute) entries.push({ declarationIdentifier: id, category: "pending review", reason: `Effective route changed from ${oldRoute} to ${newRoute}.` });
    const oldInput = oldEntry.input ?? oldEntry.requiredInput ?? [];
    const newInput = newEntry.input ?? newEntry.requiredInput ?? [];
    const requiredAdded = setDifference(newInput, oldInput);
    if (requiredAdded.length) entries.push({ declarationIdentifier: id, category: "incompatible", reason: `Required input added: ${requiredAdded.join(", ")}.` });
    const oldOutput = oldEntry.output ?? oldEntry.outputFields ?? [];
    const newOutput = newEntry.output ?? newEntry.outputFields ?? [];
    const outputAdded = setDifference(newOutput, oldOutput);
    if (outputAdded.length) entries.push({ declarationIdentifier: id, category: "compatible", reason: `Output added: ${outputAdded.join(", ")}.` });
    const outputRemoved = setDifference(oldOutput, newOutput);
    if (outputRemoved.length) entries.push({ declarationIdentifier: id, category: "incompatible", reason: `Output removed: ${outputRemoved.join(", ")}.` });
    if (!entries.some((entry) => entry.declarationIdentifier === id)) entries.push({ declarationIdentifier: id, category: "compatible", reason: "No incompatible public change detected." });
  }
  for (const [id] of current) if (!previous.has(id)) entries.push({ declarationIdentifier: id, category: "compatible", reason: "Declaration added." });
  const rank = { compatible: 0, "pending review": 1, incompatible: 2 };
  const category = entries.reduce((worst, entry) => rank[entry.category] > rank[worst] ? entry.category : worst, "compatible");
  return { category, entries: entries.sort((left, right) => `${left.declarationIdentifier}:${left.category}`.localeCompare(`${right.declarationIdentifier}:${right.category}`)) };
}

function parseListQuery(query) {
  const value = query ?? {};
  if (!isPlainObject(value)) return { error: problem(400, "INVALID_PARAMETERS", "List query must be an object") };
  const unknown = Object.keys(value).filter((key) => !["offset", "continuationToken", "limit", "clienteId"].includes(key));
  if (unknown.length) return { error: problem(400, "INVALID_PARAMETERS", `Unknown list parameter: ${unknown[0]}`) };
  const hasOffset = Object.hasOwn(value, "offset");
  const hasToken = Object.hasOwn(value, "continuationToken");
  if (hasOffset && hasToken) return { error: problem(400, "PAGINATION_MODE_CONFLICT", "offset and continuationToken cannot be combined") };
  const limit = value.limit === undefined ? 20 : value.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return { error: problem(400, "LIMIT_INVALID", "limit must be between 1 and 100") };
  if (hasOffset && (!Number.isInteger(value.offset) || value.offset < 0)) return { error: problem(400, "OFFSET_INVALID", "offset must be a non-negative integer") };
  if (value.clienteId !== undefined && !isIdentifier(value.clienteId)) return { error: problem(400, "IDENTIFIER_INVALID", "clienteId must be a valid Entity Identifier") };
  return { value: { mode: hasToken ? "token" : "offset", offset: value.offset ?? 0, token: value.continuationToken ?? null, limit, filters: value.clienteId === undefined ? {} : { clienteId: value.clienteId } } };
}

function pathOperation(request) {
  const method = request?.method?.toUpperCase();
  const path = request?.path;
  if (method === "POST" && path === "/projects") return { name: "create" };
  if (method === "GET" && path === "/projects") return { name: "list" };
  if (method === "POST" && path === "/projects/commands/AprobarProyecto") return { name: "approve" };
  const match = typeof path === "string" ? path.match(/^\/projects\/([^/]+)$/) : null;
  if (!match) return null;
  if (method === "GET") return { name: "get", id: match[1] };
  if (method === "PATCH") return { name: "patch", id: match[1] };
  if (method === "DELETE") return { name: "delete", id: match[1] };
  return null;
}

function actorFrom(request) {
  const headers = request?.headers ?? {};
  return headers["X-Test-Actor"] ?? headers["x-test-actor"] ?? null;
}

function projectResponse(value) {
  return clone(value);
}

function writeTransaction(database, action) {
  database.exec("BEGIN");
  try {
    const result = action();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function clientProblem(issues) {
  return problem(422, "CONTRACT_VIOLATION", "Request does not satisfy the Project contract", issues);
}

function createClient(service, actor) {
  const headers = actor ? { "X-Test-Actor": actor } : {};
  const call = (request) => service.execute({ ...request, headers: { ...headers, ...(request.headers ?? {}) } });
  return {
    createProject(input) {
      const normalized = normalizeProjectForClient(input);
      const issues = validateProjectForClient(normalized);
      return issues.length ? clientProblem(issues) : call({ method: "POST", path: "/projects", body: normalized });
    },
    getProject(id) {
      const issues = validateProjectForClient({ id }, "partial");
      return issues.length ? clientProblem(issues) : call({ method: "GET", path: `/projects/${id}` });
    },
    listProjects(query = {}) {
      return call({ method: "GET", path: "/projects", query });
    },
    patchProject(id, input) {
      const idIssues = validateProjectForClient({ id }, "partial");
      const normalized = normalizeProjectForClient(input);
      const issues = [...idIssues, ...validateProjectForClient(normalized, "partial")];
      return issues.length ? clientProblem(issues) : call({ method: "PATCH", path: `/projects/${id}`, body: normalized });
    },
    deleteProject(id) {
      const issues = validateProjectForClient({ id }, "partial");
      return issues.length ? clientProblem(issues) : call({ method: "DELETE", path: `/projects/${id}` });
    },
    approveProject(id) {
      const issues = validateProjectForClient({ id }, "partial");
      return issues.length ? clientProblem(issues) : call({ method: "POST", path: "/projects/commands/AprobarProyecto", body: { id } });
    }
  };
}

export function createAcceptanceService(options = {}) {
  const semanticInput = options.semanticSource ?? PROJECT_SEMANTIC_SOURCE;
  const inspected = verifyProjectContract(inspectSemanticSource(semanticInput));
  const mocking = parseMockingSource(options.mockingSource ?? null);
  const diagnostics = [
    ...(inspected.verification.status === "blocked" ? inspected.verification.diagnostics : []),
    ...(mocking.status === "blocked" ? mocking.diagnostics : [])
  ];
  const verification = diagnostics.length
    ? { status: "blocked", diagnostics: diagnostics.sort((left, right) => `${left.code}:${left.paths[0] ?? ""}`.localeCompare(`${right.code}:${right.paths[0] ?? ""}`)) }
    : { status: "verified", diagnostics: [] };
  const effectiveModel = verification.status === "verified" ? projectModelFrom(inspected) : null;
  let database = null;
  let tokenSecret = options.tokenSecret ?? secureRandomBytes(32);
  if (!Buffer.isBuffer(tokenSecret)) tokenSecret = Buffer.from(tokenSecret);
  if (tokenSecret.length !== 32) {
    verification.status = "blocked";
    verification.diagnostics = [...verification.diagnostics, issue("TOKEN_KEY_INVALID", [], "Continuation token key must be 32 octets")];
  }
  if (verification.status === "verified") database = openDatabase(options.databasePath ?? ":memory:");
  const clock = options.clock ?? (() => Date.now());
  const randomBytes = options.randomBytes ?? secureRandomBytes;
  const tokenTtlMs = options.tokenTtlMs ?? 300_000;

  function storage() {
    return database ? { projects: readProjects(database) } : null;
  }

  function nextProjectId() {
    const existing = new Set(readProjects(database).map((project) => project.id));
    let number = 1;
    while (existing.has(`project-${number}`)) number += 1;
    return `project-${number}`;
  }

  function transitionFor(operation, request) {
    const actor = actorFrom(request);
    const granted = ACTORS[actor] ?? [];
    const required = OPERATION_PERMISSIONS[operation] ?? [];
    const missing = required.filter((permission) => !granted.includes(permission));
    return { operation, actor, required, granted, missing };
  }

  function authorized(operation, request) {
    const transition = transitionFor(operation, request);
    if (!transition.actor || !Object.hasOwn(ACTORS, transition.actor) || transition.missing.length) {
      return { transition, response: problem(403, "ACCESS_DENIED", "The Test Actor is not authorized") };
    }
    return { transition, response: null };
  }

  function handleCreate(request) {
    const parsed = parseBody(request.body);
    if (parsed.error) return parsed.error;
    const normalized = normalizeProject(parsed.value);
    const issues = validateProject(normalized);
    if (issues.length) return clientProblem(issues);
    const id = normalized.id ?? nextProjectId();
    const project = { id, clienteId: normalized.clienteId, nombre: normalized.nombre, periodo: normalized.periodo, importe: normalized.importe };
    if (readProjects(database).some((existing) => existing.id === id)) return problem(409, "IDENTIFIER_CONFLICT", "Project identifier already exists");
    writeTransaction(database, () => database.prepare("INSERT INTO projects (id, document) VALUES (?, ?)").run(id, JSON.stringify(project)));
    return success(201, projectResponse(project));
  }

  function handleGet(request, id) {
    const issues = validateProject({ id }, "partial");
    if (issues.length) return clientProblem(issues);
    const project = storage().projects.find((candidate) => candidate.id === id);
    return project ? success(200, projectResponse(project)) : problem(404, "PROJECT_NOT_FOUND", "Project was not found");
  }

  function handleList(request) {
    const parsed = parseListQuery(request.query);
    if (parsed.error) return parsed.error;
    const { mode, offset, token, limit, filters } = parsed.value;
    const now = Number(clock());
    const expectedFingerprint = projectRequestFingerprint(filters);
    let position = offset;
    if (mode === "token") {
      const payload = decodeToken(token, tokenSecret, now, { operation: "list", fingerprint: expectedFingerprint });
      if (!payload) return problem(400, "INVALID_CONTINUATION_TOKEN", "Continuation token is invalid or expired");
      position = payload.position;
    }
    const projects = storage().projects.filter((project) => !filters.clienteId || project.clienteId === filters.clienteId);
    const items = projects.slice(position, position + limit).map(projectResponse);
    const pagination = { mode, limit };
    if (mode === "offset") pagination.offset = position;
    if (position + limit < projects.length) {
      pagination.continuationToken = encodeToken(
        { typ: "continuation+jwe", alg: "dir", enc: "A256GCM", kid: "local" },
        { version: 1, operation: "list", iat: now, exp: now + tokenTtlMs, fingerprint: expectedFingerprint, position: position + limit },
        tokenSecret,
        randomBytes
      );
    }
    return success(200, { items, pagination });
  }

  function handlePatch(request, id) {
    const idIssues = validateProject({ id }, "partial");
    if (idIssues.length) return clientProblem(idIssues);
    const existing = storage().projects.find((candidate) => candidate.id === id);
    if (!existing) return problem(404, "PROJECT_NOT_FOUND", "Project was not found");
    const parsed = parseBody(request.body);
    if (parsed.error) return parsed.error;
    const normalized = normalizeProject(parsed.value);
    const issues = validateProject(normalized, "partial");
    if (issues.length) return clientProblem(issues);
    const next = { ...existing, ...normalized, id };
    const completeIssues = validateProject(next);
    if (completeIssues.length) return clientProblem(completeIssues);
    writeTransaction(database, () => database.prepare("UPDATE projects SET document = ? WHERE id = ?").run(JSON.stringify(next), id));
    return success(200, projectResponse(next));
  }

  function handleDelete(request, id) {
    const issues = validateProject({ id }, "partial");
    if (issues.length) return clientProblem(issues);
    if (!storage().projects.some((project) => project.id === id)) return problem(404, "PROJECT_NOT_FOUND", "Project was not found");
    writeTransaction(database, () => database.prepare("DELETE FROM projects WHERE id = ?").run(id));
    return success(204);
  }

  function matchScenarios(operation, input) {
    const scenarios = mocking.scenarios.filter((scenario) => scenario.operation === operation && scenarioMatches(scenario, input));
    if (!scenarios.length) return { status: "not-simulated", response: null, error: null };
    if (scenarios.length > 1) return { status: "ambiguous", response: null, error: { code: "SCENARIO_AMBIGUOUS" } };
    const scenario = scenarios[0];
    return { status: "matched", response: scenario.response ? JSON.parse(scenario.response) : null, error: scenario.error ? JSON.parse(scenario.error) : null };
  }

  function handleApprove(request) {
    const parsed = parseBody(request.body);
    if (parsed.error) return parsed.error;
    const idIssues = validateProject({ id: parsed.value?.id }, "partial");
    if (idIssues.length) return clientProblem(idIssues);
    const project = storage().projects.find((candidate) => candidate.id === parsed.value.id);
    if (!project) return problem(404, "PROJECT_NOT_FOUND", "Project was not found");
    const matched = matchScenarios("AprobarProyecto", { id: parsed.value.id });
    if (matched.status === "not-simulated") return problem(422, "NOT_SIMULATED", "No Mocking Scenario matches AprobarProyecto");
    if (matched.status === "ambiguous") return problem(422, "SCENARIO_AMBIGUOUS", "Multiple Mocking Scenarios match AprobarProyecto");
    if (matched.error) return problem(422, "DECLARED_BUSINESS_ERROR", "AprobarProyecto returned a declared business error", [issue(matched.error.code ?? "DECLARED_BUSINESS_ERROR", ["/id"])]);
    return success(200, matched.response);
  }

  function execute(request) {
    if (verification.status !== "verified") return withTransition(problem(503, "CONTRACT_NOT_VERIFIED", "The selected sources are blocked"), { operation: null, required: [], granted: [], missing: [] });
    const operation = pathOperation(request);
    if (!operation) return withTransition(problem(404, "ROUTE_NOT_FOUND", "Route was not found"), { operation: null, required: [], granted: [], missing: [] });
    const authorization = authorized(operation.name, request);
    if (authorization.response) return withTransition(authorization.response, authorization.transition);
    try {
      const response = operation.name === "create" ? handleCreate(request)
        : operation.name === "get" ? handleGet(request, operation.id)
          : operation.name === "list" ? handleList(request)
            : operation.name === "patch" ? handlePatch(request, operation.id)
              : operation.name === "delete" ? handleDelete(request, operation.id)
                : handleApprove(request);
      return withTransition(response, authorization.transition);
    } catch {
      return withTransition(problem(500, "TECHNICAL_FAILURE", "The request could not be completed"), authorization.transition);
    }
  }

  const service = {
    source: inspected.source,
    mockingSource: mocking,
    verification,
    effectiveModel: verification.status === "verified" ? effectiveModel : null,
    generatedClientSource: verification.status === "verified" ? generatedClientSource(effectiveModel) : null,
    client: verification.status === "verified" ? createClient(null, options.actor ?? null) : null,
    execute,
    storage,
    matchScenarios,
    conformance: runConformance,
    compareCompatibility: compareSources,
    close() {
      if (database) {
        database.close();
        database = null;
      }
    }
  };
  if (service.client) service.client = createClient(service, options.actor ?? null);
  return service;
}
