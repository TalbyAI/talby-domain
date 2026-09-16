import { DataFactory, Parser, Store } from "n3";

const { blankNode, defaultGraph, literal, namedNode, quad } = DataFactory;
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
const CORE_PREDICATES = new Set([
  VISUAL_X, VISUAL_Y, VISUAL_WIDTH, VISUAL_HEIGHT,
  VISUAL_FILL, VISUAL_STROKE, VISUAL_EXTENSION
]);
const DECIMAL_PATTERN = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/;
const COLOR_PATTERN = /^#[0-9A-Fa-f]{8}$/;
const MAX_BYTES = 1_048_576;
const MAX_QUADS = 10_000;

class VisualGraphLimitError extends RangeError {
  constructor(code) {
    super(code);
    this.code = code;
  }
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
    if (character === "\"" || character === "'") {
      quote = input.startsWith(character.repeat(3), index) ? character.repeat(3) : character;
      index += quote.length - 1;
      continue;
    }
    if (character === "<") {
      if (input[index + 1] === "<") throw new SyntaxError("RDF-star syntax is not supported");
      iri = true;
      continue;
    }
    if (character === ">" && input[index + 1] === ">") throw new SyntaxError("RDF-star syntax is not supported");
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

function termKey(term) {
  return term.termType + ":" + term.value;
}

function publicTerm(term) {
  if (term.termType === "Literal") {
    return {
      termType: "Literal",
      value: term.value,
      datatype: term.datatype.value,
      language: term.language || null
    };
  }
  return { termType: term.termType, value: term.value };
}

function publicTriple(value) {
  return {
    subject: publicTerm(value.subject),
    predicate: publicTerm(value.predicate),
    object: publicTerm(value.object)
  };
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
    .map(({ subject }) => [termKey(subject), subject])).values()];
}

function annotationTriples(dataset, target) {
  const extensionNodes = extensionNodesFrom(dataset, target);
  return [...dataset]
    .filter(({ subject }) => termKey(subject) === termKey(target) || extensionNodes.has(termKey(subject)))
    .map(publicTriple);
}

function rdfTerm(term) {
  if (!term || typeof term.termType !== "string") throw new TypeError("RDF term is required");
  if (term.termType !== "DefaultGraph" && typeof term.value !== "string") throw new TypeError("RDF term value is required");
  if (term.termType === "NamedNode") return namedNode(term.value);
  if (term.termType === "BlankNode") return blankNode(term.value);
  if (term.termType === "DefaultGraph") return defaultGraph();
  if (term.termType === "Literal") {
    const datatype = term.datatype?.value ?? term.datatype;
    if (typeof term.value !== "string" || typeof datatype !== "string") throw new TypeError("Literal datatype is required");
    return term.language ? literal(term.value, term.language) : literal(term.value, namedNode(datatype));
  }
  throw new TypeError("Unsupported RDF term");
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
    if (Buffer.byteLength(input, "utf8") > MAX_BYTES) throw new VisualGraphLimitError("VISUAL_SOURCE_BYTES_LIMIT");
    rejectNonTurtleExtensions(input);
    const parsed = new Parser({ format: "text/turtle" }).parse(input);
    if (parsed.length > MAX_QUADS) throw new VisualGraphLimitError("VISUAL_QUAD_COUNT_LIMIT");
    if (parsed.some(containsQuadTerm)) throw new SyntaxError("RDF-star syntax is not supported");
    return new Store(parsed);
  }
  const graph = input?.graph ?? (input && typeof input[Symbol.iterator] === "function" ? input : null);
  if (!graph || typeof graph[Symbol.iterator] !== "function") throw new TypeError("Visual Source graph is required");
  const values = [];
  for (const value of graph) {
    if (values.length === MAX_QUADS) throw new VisualGraphLimitError("VISUAL_QUAD_COUNT_LIMIT");
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
    diagnostics
  };
}

function validEffectiveModel(model) {
  return model !== null
    && typeof model === "object"
    && model.declarationIndex !== null
    && typeof model.declarationIndex === "object"
    && model.moduleOwnership !== null
    && typeof model.moduleOwnership === "object";
}

function selectModule(dataset, model) {
  const descriptors = [...dataset.match(null, namedNode(RDF_TYPE), namedNode(VISUAL_SOURCE))]
    .map(({ subject }) => subject);
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

  const properties = [VISUAL_X, VISUAL_Y, VISUAL_WIDTH, VISUAL_HEIGHT, VISUAL_FILL, VISUAL_STROKE, VISUAL_EXTENSION];
  for (const predicate of properties) {
    if (values(dataset, target, predicate).length > 1) diagnostics.push(diagnostic("VISUAL_CARDINALITY_INVALID", { target: target.value, predicate }));
  }

  const x = values(dataset, target, VISUAL_X);
  const y = values(dataset, target, VISUAL_Y);
  if ((x.length === 0) !== (y.length === 0)) diagnostics.push(diagnostic("VISUAL_COORDINATE_PAIR_INVALID", { target: target.value }));
  if (x[0] && !isDecimal(x[0])) diagnostics.push(diagnostic("VISUAL_DECIMAL_INVALID", { target: target.value, predicate: VISUAL_X }));
  if (y[0] && !isDecimal(y[0])) diagnostics.push(diagnostic("VISUAL_DECIMAL_INVALID", { target: target.value, predicate: VISUAL_Y }));

  const width = values(dataset, target, VISUAL_WIDTH);
  const height = values(dataset, target, VISUAL_HEIGHT);
  if ((width.length === 0) !== (height.length === 0)) diagnostics.push(diagnostic("VISUAL_DIMENSION_PAIR_INVALID", { target: target.value }));
  for (const [predicate, value] of [[VISUAL_WIDTH, width[0]], [VISUAL_HEIGHT, height[0]]]) {
    if (!value) continue;
    if (!isDecimal(value)) diagnostics.push(diagnostic("VISUAL_DECIMAL_INVALID", { target: target.value, predicate }));
    else if (!isNonNegativeDecimal(value)) diagnostics.push(diagnostic("VISUAL_DIMENSION_NEGATIVE", { target: target.value, predicate }));
  }

  for (const predicate of [VISUAL_FILL, VISUAL_STROKE]) {
    const value = values(dataset, target, predicate)[0];
    if (value && !isColor(value)) diagnostics.push(diagnostic("VISUAL_COLOR_INVALID", { target: target.value, predicate }));
  }

  const extensions = values(dataset, target, VISUAL_EXTENSION);
  if (extensions[0] && !isNode(extensions[0])) diagnostics.push(diagnostic("VISUAL_EXTENSION_INVALID", { target: target.value, predicate: VISUAL_EXTENSION }));
  return diagnostics;
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
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
  return { applied, orphans, diagnostics };
}

export function bindVisualSource(input, effectiveSemanticModel) {
  let dataset;
  try {
    dataset = normalizeVisualGraph(input);
  } catch (error) {
    return blocked([diagnostic(error.code ?? "VISUAL_GRAPH_INVALID", { detail: error.message })]);
  }
  if (!validEffectiveModel(effectiveSemanticModel)) return blocked([diagnostic("VISUAL_EFFECTIVE_MODEL_INVALID")]);
  const selection = selectModule(dataset, effectiveSemanticModel);
  if (selection.diagnostics.length) return blocked(selection.diagnostics);
  const diagnostics = validateDescriptor(dataset, selection.descriptor);
  const records = [];
  const extensionNodes = allExtensionNodes(dataset);
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
