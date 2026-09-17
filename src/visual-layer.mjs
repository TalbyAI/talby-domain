import { DataFactory, Parser, Store } from "n3";
import {
  containsQuadTerm,
  publicTriple,
  rdfTerm as createRdfTerm,
  rejectNonTurtleExtensions,
  TURTLE_LIMITS
} from "./rdf-utils.mjs";

const { defaultGraph, namedNode, quad } = DataFactory;
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const VISUAL = "https://github.com/TalbyAI/talby-domain/vocab/visual#";
const VISUAL_SOURCE = VISUAL + "VisualSource";
const VISUAL_MODULE = VISUAL + "module";
const VISUAL_X = VISUAL + "x";
const VISUAL_Y = VISUAL + "y";
const VISUAL_WIDTH = VISUAL + "width";
const VISUAL_HEIGHT = VISUAL + "height";
const VISUAL_FILL = VISUAL + "fill";
const VISUAL_STROKE = VISUAL + "stroke";
const VISUAL_EXTENSION = VISUAL + "extension";
const CORE_PREDICATE_LIST = [
  VISUAL_X, VISUAL_Y, VISUAL_WIDTH, VISUAL_HEIGHT,
  VISUAL_FILL, VISUAL_STROKE, VISUAL_EXTENSION
];
const CORE_PREDICATES = new Set(CORE_PREDICATE_LIST);
const DECIMAL_PATTERN = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/;
const COLOR_PATTERN = /^#[0-9A-Fa-f]{8}$/;

class VisualGraphLimitError extends RangeError {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function termKey(term) {
  return term.termType + ":" + term.value;
}

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
    .map(({ subject }) => [termKey(subject), subject])).values()]
    .sort((left, right) => compareText(left.value, right.value));
}

function annotationTriples(dataset, target) {
  const extensionNodes = extensionNodesFrom(dataset, target);
  return [...dataset]
    .filter(({ subject }) => termKey(subject) === termKey(target) || extensionNodes.has(termKey(subject)))
    .map(publicTriple)
    .sort(compareTriple);
}

function rdfTerm(term) {
  if (!term || typeof term.termType !== "string") throw new TypeError("RDF term is required");
  if (term.termType !== "DefaultGraph" && typeof term.value !== "string") throw new TypeError("RDF term value is required");
  if (term.termType === "Literal") {
    const datatype = term.datatype?.value ?? term.datatype;
    if (typeof term.value !== "string" || typeof datatype !== "string") throw new TypeError("Literal datatype is required");
  }
  return createRdfTerm(term);
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
  if ((subject.termType !== "NamedNode" && subject.termType !== "BlankNode") || predicate.termType !== "NamedNode" || object.termType === "DefaultGraph") {
    throw new TypeError("Invalid RDF triple positions");
  }
  return quad(subject, predicate, object, graph);
}

function normalizeVisualGraph(input) {
  if (typeof input === "string") {
    if (Buffer.byteLength(input, "utf8") > TURTLE_LIMITS.maxBytes) throw new VisualGraphLimitError("VISUAL_SOURCE_BYTES_LIMIT");
    rejectNonTurtleExtensions(input);
    const parsed = new Parser({ format: "text/turtle" }).parse(input);
    if (parsed.length > TURTLE_LIMITS.maxQuads) throw new VisualGraphLimitError("VISUAL_QUAD_COUNT_LIMIT");
    if (parsed.some(containsQuadTerm)) throw new SyntaxError("RDF-star syntax is not supported");
    return new Store(parsed);
  }
  const graph = input?.graph ?? (input && typeof input[Symbol.iterator] === "function" ? input : null);
  if (!graph || typeof graph[Symbol.iterator] !== "function") throw new TypeError("Visual Source graph is required");
  const values = [];
  for (const value of graph) {
    if (values.length === TURTLE_LIMITS.maxQuads) throw new VisualGraphLimitError("VISUAL_QUAD_COUNT_LIMIT");
    values.push(rdfQuad(value));
  }
  return new Store(values);
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
    diagnostics: [...diagnostics].sort(compareBlockingDiagnostic)
  };
}

function validEffectiveModel(model) {
  const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  if (!isRecord(model) || !isRecord(model.declarationIndex) || !isRecord(model.moduleOwnership)) return false;
  if (!Object.entries(model.declarationIndex).every(([identifier, declaration]) =>
    isRecord(declaration)
    && declaration.declarationIdentifier === identifier
    && typeof declaration.kind === "string"
  )) return false;
  return Object.values(model.moduleOwnership).every((ownership) =>
    isRecord(ownership)
    && (ownership.ownerModule === null || typeof ownership.ownerModule === "string")
    && Array.isArray(ownership.ownerModules)
    && ownership.ownerModules.every((ownerModule) => typeof ownerModule === "string")
  );
}

function selectModule(dataset, model, extensionNodes) {
  const descriptors = [...dataset.match(null, namedNode(RDF_TYPE), namedNode(VISUAL_SOURCE))]
    .map(({ subject }) => subject)
    .filter((subject) => !extensionNodes.has(termKey(subject)));
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

function validateDescriptor(dataset, descriptor) {
  const diagnostics = [];
  const types = values(dataset, descriptor, RDF_TYPE);
  if (types.length !== 1 || types[0]?.termType !== "NamedNode" || types[0].value !== VISUAL_SOURCE) {
    diagnostics.push(diagnostic("VISUAL_DESCRIPTOR_TYPE_INVALID", {
      target: descriptor.value,
      predicate: RDF_TYPE
    }));
  }
  for (const triple of dataset.match(descriptor, null, null)) {
    if (triple.predicate.value !== RDF_TYPE && triple.predicate.value !== VISUAL_MODULE) {
      diagnostics.push(diagnostic("VISUAL_UNKNOWN_PROPERTY", {
        target: descriptor.value,
        predicate: triple.predicate.value
      }));
    }
  }
  return diagnostics;
}

function validateAnnotation(dataset, target) {
  const diagnostics = [];
  if (target.termType !== "NamedNode") {
    diagnostics.push(diagnostic("VISUAL_TARGET_IRI_REQUIRED", { target: target.value }));
    return diagnostics;
  }

  const triples = [...dataset.match(target, null, null)];
  for (const triple of triples) {
    if (!CORE_PREDICATES.has(triple.predicate.value)) {
      diagnostics.push(diagnostic("VISUAL_UNKNOWN_PROPERTY", {
        target: target.value,
        predicate: triple.predicate.value
      }));
    }
  }

  for (const predicate of CORE_PREDICATE_LIST) {
    if (values(dataset, target, predicate).length > 1) diagnostics.push(diagnostic("VISUAL_CARDINALITY_INVALID", { target: target.value, predicate }));
  }

  const x = values(dataset, target, VISUAL_X);
  const y = values(dataset, target, VISUAL_Y);
  if ((x.length === 0) !== (y.length === 0)) diagnostics.push(diagnostic("VISUAL_COORDINATE_PAIR_INVALID", { target: target.value }));
  for (const [predicate, propertyValues] of [[VISUAL_X, x], [VISUAL_Y, y]]) {
    for (const value of propertyValues) {
      if (!isDecimal(value)) diagnostics.push(diagnostic("VISUAL_DECIMAL_INVALID", { target: target.value, predicate }));
    }
  }

  const width = values(dataset, target, VISUAL_WIDTH);
  const height = values(dataset, target, VISUAL_HEIGHT);
  if ((width.length === 0) !== (height.length === 0)) diagnostics.push(diagnostic("VISUAL_DIMENSION_PAIR_INVALID", { target: target.value }));
  for (const [predicate, propertyValues] of [[VISUAL_WIDTH, width], [VISUAL_HEIGHT, height]]) {
    for (const value of propertyValues) {
      if (!isDecimal(value)) diagnostics.push(diagnostic("VISUAL_DECIMAL_INVALID", { target: target.value, predicate }));
      else if (!isNonNegativeDecimal(value)) diagnostics.push(diagnostic("VISUAL_DIMENSION_NEGATIVE", { target: target.value, predicate }));
    }
  }

  for (const predicate of [VISUAL_FILL, VISUAL_STROKE]) {
    for (const value of values(dataset, target, predicate)) {
      if (!isColor(value)) diagnostics.push(diagnostic("VISUAL_COLOR_INVALID", { target: target.value, predicate }));
    }
  }

  const extensions = values(dataset, target, VISUAL_EXTENSION);
  for (const value of extensions) {
    if (!isNode(value)) diagnostics.push(diagnostic("VISUAL_EXTENSION_INVALID", { target: target.value, predicate: VISUAL_EXTENSION }));
  }
  return diagnostics;
}

function compareText(left, right) {
  const leftCodePoints = [...left];
  const rightCodePoints = [...right];
  const length = Math.min(leftCodePoints.length, rightCodePoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftCodePoints[index].codePointAt(0) - rightCodePoints[index].codePointAt(0);
    if (difference !== 0) return difference;
  }
  return leftCodePoints.length - rightCodePoints.length;
}

function compareTuple(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    const difference = compareText(left[index], right[index]);
    if (difference !== 0) return difference;
  }
  return 0;
}

function compareTerm(left, right) {
  return compareTuple(
    [left.termType, left.value, left.datatype ?? "", left.language ?? ""],
    [right.termType, right.value, right.datatype ?? "", right.language ?? ""]
  );
}

function compareTriple(left, right) {
  return compareTerm(left.subject, right.subject)
    || compareTerm(left.predicate, right.predicate)
    || compareTerm(left.object, right.object);
}

function compareDiagnostic(left, right) {
  return compareTuple(
    [left.target ?? "", left.reason ?? "", left.code ?? "", left.predicate ?? ""],
    [right.target ?? "", right.reason ?? "", right.code ?? "", right.predicate ?? ""]
  );
}

function compareBlockingDiagnostic(left, right) {
  return compareTuple(
    [left.target ?? "", left.predicate ?? "", left.code ?? "", left.detail ?? ""],
    [right.target ?? "", right.predicate ?? "", right.code ?? "", right.detail ?? ""]
  );
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
  return {
    applied: applied.sort((left, right) => compareText(left.target, right.target)),
    orphans: orphans.sort((left, right) => compareText(left.target, right.target)),
    diagnostics: diagnostics.sort(compareDiagnostic)
  };
}

export function bindVisualSource(input, effectiveSemanticModel) {
  let dataset;
  try {
    dataset = normalizeVisualGraph(input);
  } catch (error) {
    const code = error instanceof VisualGraphLimitError ? error.code : "VISUAL_GRAPH_INVALID";
    const fields = typeof error?.message === "string" ? { detail: error.message } : {};
    return blocked([diagnostic(code, fields)]);
  }
  if (!validEffectiveModel(effectiveSemanticModel)) return blocked([diagnostic("VISUAL_EFFECTIVE_MODEL_INVALID")]);
  const extensionNodes = allExtensionNodes(dataset);
  const selection = selectModule(dataset, effectiveSemanticModel, extensionNodes);
  if (selection.diagnostics.length) return blocked(selection.diagnostics);
  const diagnostics = validateDescriptor(dataset, selection.descriptor);
  const records = [];
  for (const target of annotationSubjects(dataset, selection.descriptor, extensionNodes)) {
    const annotationDiagnostics = validateAnnotation(dataset, target);
    diagnostics.push(...annotationDiagnostics);
    if (annotationDiagnostics.length === 0) {
      records.push({ target: target.value, triples: annotationTriples(dataset, target) });
    }
  }
  if (diagnostics.length) return blocked(diagnostics, selection.selectedModule);
  const binding = bindValidatedAnnotations(records, effectiveSemanticModel, selection.selectedModule);
  return {
    status: "bound",
    selectedModule: selection.selectedModule,
    ...binding
  };
}
