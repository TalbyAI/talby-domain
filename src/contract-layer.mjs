const CONTRACT = "https://github.com/TalbyAI/talby-domain/vocab/contract#";
const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const XSD = "http://www.w3.org/2001/XMLSchema#";

const RDF_TYPE = `${RDF}type`;
const RDF_FIRST = `${RDF}first`;
const RDF_REST = `${RDF}rest`;
const RDF_NIL = `${RDF}nil`;
const CONTRACT_PARENT = `${CONTRACT}parent`;

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

function namedNode(value) {
  return { termType: "NamedNode", value };
}

function blankNode(value) {
  return { termType: "BlankNode", value };
}

function literal(value, datatype = `${XSD}string`, language = null) {
  return { termType: "Literal", value, datatype, language };
}

function tokenise(input) {
  const tokens = [];
  let index = 0;
  let blankNodeNumber = 0;

  while (index < input.length) {
    const character = input[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === "#") {
      while (index < input.length && input[index] !== "\n") index += 1;
      continue;
    }
    if (";,.[]()".includes(character)) {
      tokens.push({ type: "punctuation", value: character });
      index += 1;
      continue;
    }
    if (character === "<") {
      const end = input.indexOf(">", index + 1);
      if (end < 0) throw new SyntaxError("Unterminated IRI");
      tokens.push({ type: "iri", value: input.slice(index + 1, end) });
      index = end + 1;
      continue;
    }
    if (character === '"') {
      let value = "";
      index += 1;
      while (index < input.length) {
        const current = input[index++];
        if (current === '"') break;
        if (current !== "\\") {
          value += current;
          continue;
        }
        if (index >= input.length) throw new SyntaxError("Unterminated string escape");
        const escaped = input[index++];
        value += ({ n: "\n", r: "\r", t: "\t", '"': '"', "\\": "\\" }[escaped] ?? escaped);
      }
      if (input[index - 1] !== '"') throw new SyntaxError("Unterminated string");
      tokens.push({ type: "literal", value });
      continue;
    }
    const start = index;
    while (index < input.length && !/\s/.test(input[index]) && !";,.[]()<>\"".includes(input[index])) index += 1;
    if (start === index) throw new SyntaxError(`Unexpected character ${input[index]}`);
    const value = input.slice(start, index);
    if (value.startsWith("_:") && value.length === 2) tokens.push({ type: "blank", value: `b${blankNodeNumber++}` });
    else tokens.push({ type: "atom", value });
  }

  return tokens;
}

class TurtleParser {
  constructor(input) {
    this.tokens = tokenise(input);
    this.position = 0;
    this.prefixes = new Map();
    this.graph = [];
    this.blankNodeNumber = 0;
  }

  peek(value) {
    const token = this.tokens[this.position];
    return token && (value === undefined || token.value === value);
  }

  take() {
    const token = this.tokens[this.position++];
    if (!token) throw new SyntaxError("Unexpected end of Turtle source");
    return token;
  }

  expect(value) {
    const token = this.take();
    if (token.value !== value) throw new SyntaxError(`Expected ${value}, got ${token.value}`);
    return token;
  }

  parse() {
    while (this.position < this.tokens.length) {
      if (this.peek("@prefix") || this.peek("PREFIX") || this.peek("prefix")) this.parsePrefix();
      else this.parseStatement();
    }
    return this.graph;
  }

  parsePrefix() {
    this.take();
    const prefix = this.take().value;
    if (!prefix.endsWith(":")) throw new SyntaxError("Prefix declaration requires a colon");
    const iri = this.take();
    if (iri.type !== "iri") throw new SyntaxError("Prefix declaration requires an IRI");
    this.prefixes.set(prefix.slice(0, -1), iri.value);
    if (this.peek(".")) this.take();
  }

  parseStatement() {
    const subject = this.parseResource();
    this.parsePredicateObjectList(subject);
    this.expect(".");
  }

  parsePredicateObjectList(subject) {
    while (true) {
      const predicate = this.parsePredicate();
      do {
        const object = this.parseObject();
        this.graph.push({ subject, predicate, object });
      } while (this.peek(",") && this.take());
      if (!this.peek(";")) return;
      this.take();
      if (this.peek(".") || this.peek("]")) return;
    }
  }

  parsePredicate() {
    const token = this.take();
    if (token.value === "a") return namedNode(RDF_TYPE);
    return this.expandResource(token);
  }

  parseObject() {
    if (this.peek("[")) {
      this.take();
      const node = blankNode(`b${this.blankNodeNumber++}`);
      if (!this.peek("]")) this.parsePredicateObjectList(node);
      this.expect("]");
      return node;
    }
    if (this.peek("(")) return this.parseList();

    const token = this.take();
    if (token.type === "literal") {
      let datatype = `${XSD}string`;
      let language = null;
      const suffix = this.tokens[this.position];
      if (suffix?.type === "atom" && suffix.value.startsWith("@")) language = this.take().value.slice(1);
      if (this.peek("^^")) {
        this.take();
        datatype = this.expandResource(this.take()).value;
      } else if (this.tokens[this.position]?.type === "atom" && this.tokens[this.position].value.startsWith("^^")) {
        const datatypeToken = this.take().value.slice(2);
        datatype = this.expandResource({ type: "atom", value: datatypeToken }).value;
      }
      return literal(token.value, datatype, language);
    }
    if (token.type === "iri" || token.type === "atom" || token.type === "blank") {
      if (token.type === "blank") return blankNode(token.value);
      if (token.value === "true" || token.value === "false") return literal(token.value, `${XSD}boolean`);
      if (/^-?\d+$/.test(token.value)) return literal(token.value, `${XSD}integer`);
      if (/^-?(?:\d+\.\d*|\.\d+)$/.test(token.value)) return literal(token.value, `${XSD}decimal`);
      return this.expandResource(token);
    }
    throw new SyntaxError(`Invalid object ${token.value}`);
  }

  parseList() {
    this.take();
    if (this.peek(")")) {
      this.take();
      return namedNode(RDF_NIL);
    }
    const head = blankNode(`b${this.blankNodeNumber++}`);
    let current = head;
    while (!this.peek(")")) {
      this.graph.push({ subject: current, predicate: namedNode(RDF_FIRST), object: this.parseObject() });
      const next = this.peek(")") ? namedNode(RDF_NIL) : blankNode(`b${this.blankNodeNumber++}`);
      this.graph.push({ subject: current, predicate: namedNode(RDF_REST), object: next });
      current = next;
    }
    this.take();
    return head;
  }

  parseResource() {
    const token = this.take();
    if (token.type === "blank") return blankNode(token.value);
    return this.expandResource(token);
  }

  expandResource(token) {
    if (token.type === "iri") return namedNode(token.value);
    if (token.type !== "atom") throw new SyntaxError(`Expected an IRI, got ${token.value}`);
    if (token.value.startsWith("_:")) return blankNode(token.value.slice(2));
    const separator = token.value.indexOf(":");
    if (separator < 0) throw new SyntaxError(`Unknown resource ${token.value}`);
    const prefix = token.value.slice(0, separator);
    const local = token.value.slice(separator + 1);
    if (!this.prefixes.has(prefix)) throw new SyntaxError(`Unknown prefix ${prefix}`);
    return namedNode(`${this.prefixes.get(prefix)}${local}`);
  }
}

function cloneTerm(term) {
  return { ...term };
}

function normaliseTriple(triple) {
  if (Array.isArray(triple)) {
    const [subject, predicate, object] = triple;
    return { subject: namedNode(subject), predicate: namedNode(predicate), object: namedNode(object) };
  }
  if (!triple || !triple.subject || !triple.predicate || !triple.object) throw new TypeError("A graph triple needs subject, predicate, and object");
  return { subject: cloneTerm(triple.subject), predicate: cloneTerm(triple.predicate), object: cloneTerm(triple.object) };
}

function uniqueTriples(graph) {
  const seen = new Set();
  return graph.filter((triple) => {
    const key = JSON.stringify(triple);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function objects(graph, subject, predicate) {
  return graph
    .filter((triple) => triple.subject.termType !== "Literal" && triple.subject.value === subject && triple.predicate.value === predicate)
    .map((triple) => triple.object);
}

function declarationRecords(graph) {
  const byId = new Map();
  for (const triple of graph) {
    if (triple.predicate.value !== RDF_TYPE || triple.subject.termType !== "NamedNode" || triple.object.termType !== "NamedNode") continue;
    const kind = declarationKinds.get(triple.object.value);
    if (!kind) continue;
    const id = triple.subject.value;
    const record = byId.get(id) || { declarationIdentifier: id, kind, name: null, parentIdentifiers: [], moduleIdentifiers: [] };
    if (kind === "Module" || record.kind === "Constraint") record.kind = kind;
    byId.set(id, record);
  }
  for (const record of byId.values()) {
    const name = objects(graph, record.declarationIdentifier, `${CONTRACT}name`).find((term) => term.termType === "Literal");
    record.name = name?.value ?? null;
    record.parentIdentifiers = objects(graph, record.declarationIdentifier, CONTRACT_PARENT)
      .filter((term) => term.termType === "NamedNode")
      .map((term) => term.value)
      .sort();
    record.moduleIdentifiers = objects(graph, record.declarationIdentifier, `${CONTRACT}module`)
      .filter((term) => term.termType === "NamedNode")
      .map((term) => term.value)
      .sort();
  }
  return [...byId.values()].sort((left, right) => left.declarationIdentifier.localeCompare(right.declarationIdentifier));
}

function diagnosticsFor(source) {
  const declarations = source.declarations;
  const byId = new Map(declarations.map((declaration) => [declaration.declarationIdentifier, declaration]));
  const diagnostics = [];

  for (const triple of source.graph) {
    if (triple.predicate.value === RDF_TYPE && triple.subject.termType !== "NamedNode" && declarationKinds.has(triple.object.value)) {
      diagnostics.push({ code: "DECLARATION_IDENTIFIER_REQUIRED", target: `_:${triple.subject.value}` });
    }
  }

  for (const declaration of declarations) {
    const nameTerms = objects(source.graph, declaration.declarationIdentifier, `${CONTRACT}name`).filter((term) => term.termType === "Literal");
    const parentTerms = objects(source.graph, declaration.declarationIdentifier, CONTRACT_PARENT);
    const moduleTerms = objects(source.graph, declaration.declarationIdentifier, `${CONTRACT}module`);
    if ((declaration.kind === "Module" || organizationalKinds.has(declaration.kind)) && nameTerms.length !== 1) diagnostics.push({
      code: nameTerms.length === 0 ? "NAME_REQUIRED" : "NAME_CARDINALITY",
      target: declaration.declarationIdentifier
    });
    else if ((declaration.kind === "Module" || organizationalKinds.has(declaration.kind)) && !declaration.name.trim()) diagnostics.push({ code: "NAME_REQUIRED", target: declaration.declarationIdentifier });
    if (declaration.kind === "Module" && declaration.parentIdentifiers.length) diagnostics.push({ code: "MODULE_PARENT_FORBIDDEN", target: declaration.declarationIdentifier });
    if (organizationalKinds.has(declaration.kind) && parentTerms.length === 0) diagnostics.push({ code: "PARENT_REQUIRED", target: declaration.declarationIdentifier });
    if (organizationalKinds.has(declaration.kind) && parentTerms.some((term) => term.termType !== "NamedNode")) diagnostics.push({ code: "PARENT_IRI_REQUIRED", target: declaration.declarationIdentifier });
    if (declaration.kind === "BusinessError" && moduleTerms.length !== 1) diagnostics.push({ code: "BUSINESS_ERROR_MODULE_REQUIRED", target: declaration.declarationIdentifier });
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

  return diagnostics.sort((left, right) => `${left.code}:${left.target}`.localeCompare(`${right.code}:${right.target}`));
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
  const graph = typeof input === "string"
    ? uniqueTriples(new TurtleParser(input).parse())
    : uniqueTriples((input?.graph ?? []).map(normaliseTriple));
  return { raw, graph, declarations: declarationRecords(graph) };
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
    { ...declaration, ...moduleOwnership[declaration.declarationIdentifier] }
  ]));
  return {
    semanticSource,
    declarations: semanticSource.declarations,
    declarationIndex,
    moduleOwnership
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
