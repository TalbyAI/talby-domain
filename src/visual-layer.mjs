import { DataFactory, Parser, Store } from "n3";

const { blankNode, defaultGraph, literal, namedNode, quad } = DataFactory;
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const VISUAL = "https://github.com/TalbyAI/talby-domain/vocab/visual#";
const VISUAL_SOURCE = VISUAL + "VisualSource";
const VISUAL_MODULE = VISUAL + "module";
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
  return {
    status: "bound",
    selectedModule: selection.selectedModule,
    applied: [],
    orphans: [],
    diagnostics: []
  };
}
