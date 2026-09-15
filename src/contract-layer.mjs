import { DataFactory, Parser, Store, Writer } from "n3";
import { validateShaclDataset } from "./shacl-adapter.mjs";

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

const CONTRACT = "https://github.com/TalbyAI/talby-domain/vocab/contract#";
const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const XSD = "http://www.w3.org/2001/XMLSchema#";

const RDF_TYPE = `${RDF}type`;
const RDF_FIRST = `${RDF}first`;
const RDF_REST = `${RDF}rest`;
const RDF_NIL = `${RDF}nil`;
const CONTRACT_PARENT = `${CONTRACT}parent`;
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";

const knownSemanticPredicates = new Set([
  "name", "parent", "module", "code", "detailsType", "errors", "valueType", "baseType",
  "allowedValue", "enabled", "defaultCrud", "required", "nullable", "itemNullable", "normalizers",
  "normalizer", "constraint", "field", "uses", "identifierUse", "itemType", "targetEntity",
  "limit", "lower", "upper", "lowerInclusive", "upperInclusive", "minLength", "maxLength",
  "pattern", "text", "eventKind", "expression", "result", "requiresPermission", "allowAnonymous",
  "route", "method", "input", "output", "assertion", "extension"
].map((localName) => `${CONTRACT}${localName}`));
knownSemanticPredicates.add(RDF_TYPE);
knownSemanticPredicates.add(RDF_FIRST);
knownSemanticPredicates.add(RDF_REST);
knownSemanticPredicates.add(`${RDFS}label`);
knownSemanticPredicates.add(`${RDFS}comment`);

const declarationKinds = new Map([
  [`${CONTRACT}Module`, "Module"],
  [`${CONTRACT}Feature`, "Feature"],
  [`${CONTRACT}Entity`, "Entity"],
  [`${CONTRACT}Command`, "Command"],
  [`${CONTRACT}Query`, "Query"],
  [`${CONTRACT}ReadModel`, "ReadModel"],
  [`${CONTRACT}Event`, "Event"],
  [`${CONTRACT}FieldGroup`, "FieldGroup"],
  [`${CONTRACT}Field`, "Field"],
  [`${CONTRACT}FieldUse`, "FieldUse"],
  [`${CONTRACT}ValueType`, "ValueType"],
  [`${CONTRACT}CollectionType`, "CollectionType"],
  [`${CONTRACT}EntityReference`, "EntityReference"],
  [`${CONTRACT}BusinessError`, "BusinessError"],
  [`${CONTRACT}Permission`, "Permission"],
  [`${CONTRACT}Constraint`, "Constraint"]
]);

const organizationalKinds = new Set(["Feature", "Entity", "Command", "Query", "ReadModel", "Event"]);

function publicTerm(term) {
  if (term.termType === "Literal") {
    return { termType: "Literal", value: term.value, datatype: term.datatype.value, language: term.language || null };
  }
  return { termType: term.termType, value: term.value };
}

function rdfTerm(term) {
  if (term?.termType === "Literal") return term.language
    ? literal(term.value, term.language)
    : literal(term.value, namedNode(term.datatype?.value ?? term.datatype));
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
    if (character === '"' || character === "'") {
      quote = input.startsWith(character.repeat(3), index) ? character.repeat(3) : character;
      index += quote.length - 1;
      continue;
    }
    if (character === "<") {
      if (input[index + 1] === "<") throw new SyntaxError("RDF-star syntax is not supported in Turtle");
      iri = true;
      continue;
    }
    if (character === ">" && input[index + 1] === ">") throw new SyntaxError("RDF-star syntax is not supported in Turtle");
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

function cloneTerm(term) {
  return { ...term };
}

function cloneSource(source) {
  return {
    raw: source.raw,
    graph: source.graph.map((triple) => ({
      subject: cloneTerm(triple.subject),
      predicate: cloneTerm(triple.predicate),
      object: cloneTerm(triple.object)
    })),
    declarations: source.declarations.map((declaration) => ({
      ...declaration,
      parentIdentifiers: [...declaration.parentIdentifiers],
      moduleIdentifiers: [...declaration.moduleIdentifiers]
    }))
  };
}

function objects(dataset, subject, predicate) {
  return [...dataset.match(namedNode(subject), namedNode(predicate), null)].map(({ object }) => object);
}

function declarationRecords(dataset) {
  const byId = new Map();
  for (const triple of dataset) {
    if (triple.predicate.value !== RDF_TYPE || triple.subject.termType !== "NamedNode" || triple.object.termType !== "NamedNode") continue;
    const kind = declarationKinds.get(triple.object.value);
    if (!kind) continue;
    const id = triple.subject.value;
    const record = byId.get(id) || { declarationIdentifier: id, kind, name: null, parentIdentifiers: [], moduleIdentifiers: [] };
    if (kind === "Module" || record.kind === "Constraint") record.kind = kind;
    byId.set(id, record);
  }
  for (const record of byId.values()) {
    const name = objects(dataset, record.declarationIdentifier, `${CONTRACT}name`).find((term) => term.termType === "Literal");
    record.name = name?.value ?? null;
    record.parentIdentifiers = objects(dataset, record.declarationIdentifier, CONTRACT_PARENT)
      .filter((term) => term.termType === "NamedNode")
      .map((term) => term.value)
      .sort();
    record.moduleIdentifiers = objects(dataset, record.declarationIdentifier, `${CONTRACT}module`)
      .filter((term) => term.termType === "NamedNode")
      .map((term) => term.value)
      .sort();
  }
  return [...byId.values()].sort((left, right) => left.declarationIdentifier.localeCompare(right.declarationIdentifier));
}

function extensionNodes(graph, extensionPredicate) {
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

function diagnosticsFor(source) {
  const declarations = source.declarations;
  const dataset = datasets.get(source);
  const byId = new Map(declarations.map((declaration) => [declaration.declarationIdentifier, declaration]));
  const diagnostics = [];
  const extensionNodesSet = extensionNodes(source.graph, `${CONTRACT}extension`);

  for (const triple of source.graph) {
    if (!knownSemanticPredicates.has(triple.predicate.value) && !extensionNodesSet.has(`${triple.subject.termType}:${triple.subject.value}`)) diagnostics.push({
      code: "UNKNOWN_PROPERTY",
      predicate: triple.predicate.value,
      target: triple.subject.termType === "NamedNode" ? triple.subject.value : `_:${triple.subject.value}`
    });
  }

  for (const triple of source.graph) {
    if (triple.predicate.value === RDF_TYPE && triple.subject.termType !== "NamedNode" && declarationKinds.has(triple.object.value)) {
      diagnostics.push({ code: "DECLARATION_IDENTIFIER_REQUIRED", target: `_:${triple.subject.value}` });
    }
  }

  for (const declaration of declarations) {
    const nameTerms = objects(dataset, declaration.declarationIdentifier, `${CONTRACT}name`).filter((term) => term.termType === "Literal");
    const parentTerms = objects(dataset, declaration.declarationIdentifier, CONTRACT_PARENT);
    const moduleTerms = objects(dataset, declaration.declarationIdentifier, `${CONTRACT}module`);
    if ((declaration.kind === "Module" || organizationalKinds.has(declaration.kind)) && nameTerms.length !== 1) diagnostics.push({
      code: nameTerms.length === 0 ? "NAME_REQUIRED" : "NAME_CARDINALITY",
      target: declaration.declarationIdentifier
    });
    else if ((declaration.kind === "Module" || organizationalKinds.has(declaration.kind)) && !declaration.name.trim()) diagnostics.push({ code: "NAME_REQUIRED", target: declaration.declarationIdentifier });
    if (declaration.kind === "Module" && declaration.parentIdentifiers.length) diagnostics.push({ code: "MODULE_PARENT_FORBIDDEN", target: declaration.declarationIdentifier });
    if (organizationalKinds.has(declaration.kind) && parentTerms.length === 0) diagnostics.push({ code: "PARENT_REQUIRED", target: declaration.declarationIdentifier });
    if (organizationalKinds.has(declaration.kind) && parentTerms.length > 1) diagnostics.push({ code: "PARENT_CARDINALITY", target: declaration.declarationIdentifier });
    if (organizationalKinds.has(declaration.kind) && parentTerms.some((term) => term.termType !== "NamedNode")) diagnostics.push({ code: "PARENT_IRI_REQUIRED", target: declaration.declarationIdentifier });
    if (declaration.kind === "BusinessError" && moduleTerms.length !== 1) diagnostics.push({ code: "BUSINESS_ERROR_MODULE_REQUIRED", target: declaration.declarationIdentifier });
    for (const module of moduleTerms) {
      if (module.termType === "NamedNode" && (!byId.has(module.value) || byId.get(module.value).kind !== "Module")) diagnostics.push({
        code: "MODULE_NOT_FOUND",
        parent: module.value,
        target: declaration.declarationIdentifier
      });
    }
    for (const parent of declaration.parentIdentifiers) {
      const parentDeclaration = byId.get(parent);
      if (!parentDeclaration) diagnostics.push({ code: "PARENT_NOT_FOUND", target: declaration.declarationIdentifier, parent });
      else if (parentDeclaration.kind !== "Module" && parentDeclaration.kind !== "Feature") diagnostics.push({ code: "PARENT_NOT_ORGANIZATIONAL", target: declaration.declarationIdentifier, parent });
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) {
      diagnostics.push({ code: "PARENT_CYCLE", target: id });
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const parent of byId.get(id)?.parentIdentifiers ?? []) if (byId.has(parent)) visit(parent);
    visiting.delete(id);
    visited.add(id);
  };
  for (const declaration of declarations) visit(declaration.declarationIdentifier);

  return diagnostics.sort((left, right) => {
    const leftKey = `${left.code}:${left.target}`;
    const rightKey = `${right.code}:${right.target}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

function ownershipFor(declarations) {
  const byId = new Map(declarations.map((declaration) => [declaration.declarationIdentifier, declaration]));
  const memo = new Map();
  const resolve = (id, path = new Set()) => {
    if (memo.has(id)) return memo.get(id);
    if (path.has(id)) return [];
    const declaration = byId.get(id);
    if (!declaration) return [];
    if (declaration.kind === "Module") return [id];
    const nextPath = new Set(path).add(id);
    const owners = [...new Set([
      ...declaration.parentIdentifiers.flatMap((parent) => resolve(parent, nextPath)),
      ...declaration.moduleIdentifiers.flatMap((module) => resolve(module, nextPath))
    ])].sort();
    memo.set(id, owners);
    return owners;
  };
  return Object.fromEntries(declarations.map((declaration) => {
    const ownerModules = resolve(declaration.declarationIdentifier);
    return [declaration.declarationIdentifier, {
      ownerModule: ownerModules.length === 1 ? ownerModules[0] : null,
      ownerModules
    }];
  }));
}

/**
 * The Contract Layer semantic seam used by downstream consumers.
 *
 * `source` is the verified Semantic Source snapshot. `effectiveModel` is
 * null when verification blocks execution; otherwise it exposes stable
 * Declaration Identifiers and deterministic Module ownership without any
 * Visual Source interpretation.
 */
export function loadSemanticSource(input) {
  const raw = typeof input === "string" ? input : input?.raw ?? null;
  if (typeof raw === "string" && Buffer.byteLength(raw, "utf8") > SOURCE_LIMITS.maxBytes) throw sourceLimit("SOURCE_BYTES_LIMIT");
  if (typeof input === "string") rejectNonTurtleExtensions(input);
  const parsed = typeof input === "string"
    ? new Parser({ format: "text/turtle" }).parse(input)
    : (input?.graph ?? []).map(inputQuad);
  if (parsed.some(containsQuadTerm)) throw new SyntaxError("RDF-star syntax is not supported in Turtle");
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

export async function validateSemanticSource(source, shapesInput) {
  const dataDataset = datasets.get(source);
  if (!dataDataset) throw new TypeError("Semantic Source was not loaded by loadSemanticSource");
  const shapesSource = loadSemanticSource(shapesInput);
  return validateShaclDataset(dataDataset, datasets.get(shapesSource));
}

export function serializeSemanticSource(source) {
  const dataset = datasets.get(source);
  if (!dataset) throw new TypeError("Semantic Source was not loaded by loadSemanticSource");
  return new Promise((resolve, reject) => {
    const writer = new Writer({ format: "text/turtle" });
    writer.addQuads([...dataset]);
    writer.end((error, result) => error ? reject(error) : resolve(result));
  });
}

export function verifySemanticSource(source) {
  const diagnostics = diagnosticsFor(source);
  return diagnostics.length ? { status: "blocked", diagnostics } : { status: "verified", diagnostics: [] };
}

export function materializeEffectiveModel(verifiedSource) {
  const verification = verifySemanticSource(verifiedSource);
  if (verification.status !== "verified") return null;
  const semanticSource = cloneSource(verifiedSource);
  const moduleOwnership = ownershipFor(verifiedSource.declarations);
  const declarationIndex = Object.fromEntries(semanticSource.declarations.map((declaration) => [
    declaration.declarationIdentifier,
    { ...declaration, ...moduleOwnership[declaration.declarationIdentifier], origin: "declared" }
  ]));
  return {
    semanticSource,
    declarations: semanticSource.declarations,
    declarationIndex,
    moduleOwnership,
    origins: Object.fromEntries(semanticSource.declarations.map((declaration) => [declaration.declarationIdentifier, "declared"]))
  };
}

export function inspectSemanticSource(input) {
  let source;
  try {
    source = loadSemanticSource(input);
  } catch (error) {
    return {
      source: { raw: typeof input === "string" ? input : input?.raw ?? null, graph: [], declarations: [] },
      verification: { status: "blocked", diagnostics: [{ code: "SOURCE_SYNTAX_INVALID", detail: error.message }] },
      effectiveModel: null
    };
  }
  const verification = verifySemanticSource(source);
  return {
    source,
    verification,
    effectiveModel: verification.status === "verified" ? materializeEffectiveModel(source) : null
  };
}
