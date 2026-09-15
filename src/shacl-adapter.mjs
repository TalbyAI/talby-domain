import { DataFactory, Store } from "n3";
import SHACLValidator from "rdf-validate-shacl";
import environment from "rdf-validate-shacl/src/defaultEnv.js";

const SH = "http://www.w3.org/ns/shacl#";
const RDFS_SUBCLASS_OF = "http://www.w3.org/2000/01/rdf-schema#subClassOf";
const MAX_DIAGNOSTICS = 1_000;

function boundedMaxDiagnostics(value) {
  if (!Number.isFinite(value)) return MAX_DIAGNOSTICS;
  return Math.min(Math.max(Math.trunc(value), 0), MAX_DIAGNOSTICS);
}

function withoutSubclassInference(dataset) {
  return {
    get size() {
      return dataset.size;
    },
    add(quad) {
      dataset.add(quad);
      return this;
    },
    delete(quad) {
      return dataset.delete(quad);
    },
    has(quad) {
      return dataset.has(quad);
    },
    match(subject = null, predicate = null, object = null, graph = null) {
      if (subject === null && predicate?.termType === "NamedNode" && predicate.value === RDFS_SUBCLASS_OF && object !== null) return new Store();
      return dataset.match(subject, predicate, object, graph);
    },
    [Symbol.iterator]() {
      return dataset[Symbol.iterator]();
    }
  };
}

const factory = { ...environment, ...DataFactory, dataset: (quads = []) => withoutSubclassInference(new Store(quads)) };

function diagnosticCode(term) {
  const value = term?.value ?? SH + "ConstraintComponent";
  const local = value.startsWith(SH) ? value.slice(SH.length) : "ConstraintComponent";
  return "SHACL_" + local.replace(/ConstraintComponent$/, "").replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
}

function simplePointer(term) {
  if (!term) return [];
  const value = term.value;
  const separator = Math.max(value.lastIndexOf("#"), value.lastIndexOf("/"));
  const local = value.slice(separator + 1);
  return ["/" + local.replaceAll("~", "~0").replaceAll("/", "~1")];
}

function boundaryDiagnostic(code) {
  return { code, rule: "", target: "", paths: [], detail: "" };
}

function stableBlankNodes(dataset) {
  const values = new Map();
  for (const quad of dataset) {
    for (const term of [quad.subject, quad.predicate, quad.object]) {
      if (term.termType === "BlankNode" && !values.has(term.value)) values.set(term.value, `_:shape-${values.size}`);
    }
  }
  return values;
}

function stableRule(term, blankNodes) {
  if (!term) return "";
  return term.termType === "BlankNode" ? blankNodes.get(term.value) ?? "_:shape" : term.value;
}

export async function validateShaclDataset(dataDataset, shapesDataset, { maxDiagnostics = MAX_DIAGNOSTICS } = {}) {
  const dataView = withoutSubclassInference(dataDataset);
  const shapesView = withoutSubclassInference(shapesDataset);
  const diagnosticLimit = boundedMaxDiagnostics(maxDiagnostics);
  let report;
  try {
    const validator = new SHACLValidator(shapesView, {
      factory,
      maxErrors: diagnosticLimit + 1,
      importGraph: async () => {
        throw new Error("SHACL_IMPORT_FORBIDDEN");
      }
    });
    report = await validator.validate(dataView);
  } catch (error) {
    if (error?.message === "SHACL_IMPORT_FORBIDDEN") return { conforms: false, diagnostics: [boundaryDiagnostic("SHACL_IMPORT_FORBIDDEN")] };
    throw error;
  }
  if (report.results.length > MAX_DIAGNOSTICS) return { conforms: false, diagnostics: [boundaryDiagnostic("SHACL_DIAGNOSTIC_LIMIT")] };
  const blankNodes = stableBlankNodes(shapesView);
  const diagnostics = report.results.map((result) => ({
    code: result.path && result.path.termType !== "NamedNode"
      ? "SHACL_PATH_UNSUPPORTED"
      : diagnosticCode(result.sourceConstraintComponent),
    rule: stableRule(result.sourceShape ?? result.sourceConstraintComponent, blankNodes),
    target: result.focusNode?.value ?? "",
    paths: result.path && result.path.termType !== "NamedNode" ? [] : simplePointer(result.path),
    detail: Array.isArray(result.message)
      ? result.message.map((message) => message.value).sort().join("; ")
      : result.message?.value ?? ""
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return { conforms: report.conforms, diagnostics };
}
