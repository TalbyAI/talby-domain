import { DataFactory } from "n3";

const { blankNode, defaultGraph, literal, namedNode } = DataFactory;
const TURTLE_LOCAL_NAME_CHARACTER = /[\p{L}\p{N}\p{M}_:%@.\-\u00B7\u200C\u200D\u203F\u2040]/u;

export const TURTLE_LIMITS = Object.freeze({ maxBytes: 1_048_576, maxQuads: 10_000 });

function previousCharacter(input, index) {
  if (index === 0) return "";
  const previous = input[index - 1];
  return /[\uDC00-\uDFFF]/.test(previous) && index > 1 ? input.slice(index - 2, index) : previous;
}

export function rejectNonTurtleExtensions(input, rdfStarMessage = "RDF-star syntax is not supported") {
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
      if (input[index + 1] === "<") throw new SyntaxError(rdfStarMessage);
      iri = true;
      continue;
    }
    if (character === ">" && input[index + 1] === ">") throw new SyntaxError(rdfStarMessage);
    for (const directive of ["PREFIX", "BASE"]) {
      if (input.slice(index, index + directive.length).toUpperCase() !== directive) continue;
      const previous = previousCharacter(input, index);
      const next = input[index + directive.length];
      const escapedPrevious = input[index - 2] === "\\";
      const boundary = !escapedPrevious && (index === 0 || !TURTLE_LOCAL_NAME_CHARACTER.test(previous) || (previous === "." && /[\s;,[\](){}]/.test(input[index - 2] ?? "")));
      if (boundary && /[\s#<]/.test(next ?? "")) throw new SyntaxError("SPARQL directives are not supported in Turtle");
    }
  }
}

export function containsQuadTerm(value) {
  return [value.subject, value.predicate, value.object, value.graph].some((term) => term?.termType === "Quad");
}

function publicTerm(term) {
  if (term.termType === "Literal") {
    return { termType: "Literal", value: term.value, datatype: term.datatype.value, language: term.language || null };
  }
  return { termType: term.termType, value: term.value };
}

export function publicTriple(value) {
  return { subject: publicTerm(value.subject), predicate: publicTerm(value.predicate), object: publicTerm(value.object) };
}

export function rdfTerm(term) {
  if (term?.termType === "Literal") return term.language
    ? literal(term.value, term.language)
    : literal(term.value, namedNode(term.datatype?.value ?? term.datatype));
  if (term?.termType === "BlankNode") return blankNode(term.value);
  if (term?.termType === "DefaultGraph") return defaultGraph();
  if (term?.termType === "NamedNode") return namedNode(term.value);
  throw new TypeError("Unsupported RDF term");
}
