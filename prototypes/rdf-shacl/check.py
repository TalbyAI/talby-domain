"""PROTOTIPO desechable: declaraciones RDF/SHACL, no ejecución del contrato."""
import html
import json
from pathlib import Path
from uuid import uuid4

from pyshacl import validate
from rdflib import BNode, Graph, Literal, Namespace, RDF, URIRef
from rdflib.compare import isomorphic

C = Namespace("https://example.org/talby/contract#")
M = Namespace("https://example.org/talby/mocking#")
D = Namespace("urn:talby:prototype:declaration:")
S = Namespace("urn:talby:prototype:scenario:")
SH = Namespace("http://www.w3.org/ns/shacl#")
VOCAB = Graph().parse("vocabulary.ttl")
SHAPES = Graph().parse("shapes.ttl")


def reject_constant(value):
    raise ValueError(f"Constante JSON no admitida: {value}")


def unique_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Clave JSON duplicada: {key}")
        result[key] = value
    return result


def inspect(semantic, mocking):
    issues = []
    for _, predicate, value in semantic:
        if str(predicate).startswith(str(M)) or (predicate == RDF.type and str(value).startswith(str(M))):
            issues.append("Mocking dentro de la fuente semántica")
    for _, predicate, value in mocking:
        if str(predicate).startswith(str(C)) or (predicate == RDF.type and str(value).startswith(str(C))):
            issues.append("Declaración semántica dentro de la fuente de mocking")
    _, report, _ = validate(semantic + mocking + VOCAB, shacl_graph=SHAPES,
                            inference="none", meta_shacl=True)
    for result in report.subjects(RDF.type, SH.ValidationResult):
        issues.append(" | ".join(str(report.value(result, prop) or "")
                                 for prop in (SH.focusNode, SH.resultPath, SH.resultMessage)))
    for field, head in semantic.subject_objects(C.normalizers):
        seen = set()
        while head != RDF.nil:
            if head in seen or len(list(semantic.objects(head, RDF.first))) != 1 or len(list(semantic.objects(head, RDF.rest))) != 1:
                issues.append(f"Lista de normalizadores mal formada: {field}")
                break
            seen.add(head)
            head = semantic.value(head, RDF.rest)
    for prop in (M.responseJson, M.errorJson):
        for scenario, payload in mocking.subject_objects(prop):
            try:
                json.loads(str(payload), parse_constant=reject_constant, object_pairs_hook=unique_keys)
            except ValueError as error:
                issues.append(f"JSON inválido en {scenario}: {error}")
    return issues


def canonicalize(graph):
    # La identidad se conserva guardando el resultado; no se deduce del contenido.
    replacements = {node: URIRef(f"urn:uuid:{uuid4()}")
                    for node in graph.subjects(RDF.type, C.FieldUse) if isinstance(node, BNode)}
    result = Graph()
    for prefix, namespace in graph.namespaces():
        result.bind(prefix, namespace)
    for triple in graph:
        result.add(tuple(replacements.get(term, term) for term in triple))
    return result


def main():
    cases = []

    def case(name, expected, *, add="", remove=(), mock_add="", mock_remove=(), no_mock=False):
        semantic = Graph().parse("semantic.ttl")
        mocking = Graph() if no_mock else Graph().parse("mocking.ttl")
        prefix = f"@prefix c: <{C}> . @prefix m: <{M}> . @prefix d: <{D}> . @prefix s: <{S}> .\n"
        for graph, additions, removals in ((semantic, add, remove), (mocking, mock_add, mock_remove)):
            for triple in removals:
                graph.remove(triple)
            if additions:
                graph.parse(data=prefix + additions, format="turtle")
        issues = inspect(semantic, mocking)
        actual = not issues
        assert actual == expected, f"{name}: esperado {expected}, obtenido {actual}: {issues}"
        cases.append(dict(name=name, conforms=actual, issues=issues,
                          semantic=semantic.serialize(format="turtle"),
                          mocking=mocking.serialize(format="turtle")))

    case("Usos compartidos, nombres heredados y locales, Periodo y mocking", True)
    case("La fuente de mocking es opcional", True, no_mock=True)
    case("Cambiar el nombre del campo conserva el override del uso corto", True,
         remove=((D.Title, C.name, None),), add='d:Title c:name "nombre" .')
    case("Dos usos distintos con el mismo nombre efectivo", False,
         remove=((D.ShortTitleUse, C.name, None),))
    case("Un campo no puede declarar dos tipos", False, add="d:Title c:valueType c:Date .")
    case("Un uso debe referenciar un campo declarado", False,
         remove=((D.TitleUse, C.field, None),), add="d:TitleUse c:field d:Missing .")
    case("Un uso no puede añadir normalizadores", False, add="d:TitleUse c:normalizers (c:Trim) .")
    case("Una secuencia de normalizadores necesita una lista válida", False,
         remove=((D.Title, C.normalizers, None),), add="d:Title c:normalizers d:NotAList .")
    case("Ciclo directo de agrupación anidada", False,
         add='d:Loop a c:Field ; c:name "bucle" ; c:valueType d:Project . d:Project c:uses [ a c:FieldUse ; c:field d:Loop ] .')
    case("Ciclo anidado a través de una colección", False,
         remove=((D.Tags, C.itemType, None),), add="d:Tags c:itemType d:Project .")
    case("Una referencia por identificador puede cerrar un ciclo", True,
         remove=((D.ClientReference, C.targetEntity, None),), add="d:ClientReference c:targetEntity d:Project .")
    case("Una referencia necesita una entidad declarada", False,
         remove=((D.ClientReference, C.targetEntity, None),), add="d:ClientReference c:targetEntity d:Missing .")
    case("Una colección necesita tipo de elemento", False, remove=((D.Tags, C.itemType, None),))
    case("Una restricción de longitud no admite un límite negativo", False,
         remove=((D.Title60, C.limit, None),), add="d:Title60 c:limit -1 .")
    case("La respuesta y el error de un escenario son excluyentes", False,
         mock_add='s:ApproveKnownProject m:errorJson "{}" .')
    case("Un escenario debe declarar respuesta o error", False,
         mock_remove=((S.ApproveKnownProject, M.responseJson, None),))
    case("El escenario debe referenciar una operación declarada", False,
         mock_remove=((S.ApproveKnownProject, M.operation, None),),
         mock_add="s:ApproveKnownProject m:operation d:Missing .")
    case("JSON de respuesta mal formado", False,
         mock_remove=((S.ApproveKnownProject, M.responseJson, None),),
         mock_add='s:ApproveKnownProject m:responseJson "{" .')
    case("JSON con claves duplicadas", False,
         mock_remove=((S.ApproveKnownProject, M.responseJson, None),),
         mock_add="s:ApproveKnownProject m:responseJson '{\"x\":1,\"x\":2}' .")
    case("Mocking no puede modificar la definición del campo", False,
         mock_add='d:Title c:name "alterado" .')
    case("La fuente semántica no contiene escenarios", False,
         add="d:WrongSource a m:Scenario .")

    original = Graph().parse("semantic.ttl")
    assert len(list(original.subjects(C.uses, D.TitleUse))) == 2
    shared = next(node for node in original.subjects(RDF.type, C.FieldUse)
                  if isinstance(node, BNode) and len(list(original.subjects(C.uses, node))) == 2)
    original_field = original.value(shared, C.field)
    canonical = canonicalize(original)
    assert not any(isinstance(node, BNode) for node in canonical.subjects(RDF.type, C.FieldUse))
    mapped = next(canonical.subjects(C.field, original_field))
    assert len(list(canonical.subjects(C.uses, mapped))) == 2
    assert not inspect(canonical, Graph().parse("mocking.ttl"))
    Path("results").mkdir(exist_ok=True)
    canonical.serialize("results/canonical.ttl", format="turtle")
    reloaded = Graph().parse("results/canonical.ttl")
    assert isomorphic(canonical, reloaded)
    assert isomorphic(canonical, canonicalize(reloaded))
    cases.append(dict(name="Fuente canónica: IRIs persistidas, reutilización e idempotencia al recargar",
                      conforms=True, issues=[], semantic=canonical.serialize(format="turtle"), mocking=""))
    Path("results/cases.json").write_text(json.dumps(cases, ensure_ascii=False, indent=2), encoding="utf-8")
    buttons = "".join(f'<button type="button" onclick="show({i})">{html.escape(case["name"])}</button>'
                      for i, case in enumerate(cases))
    data = json.dumps(cases, ensure_ascii=False).replace("<", "\\u003c")
    Path("report.html").write_text("""<!doctype html><html lang="es"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Prototipo RDF/SHACL</title>
<style>body{font:16px system-ui;margin:2rem auto;padding:0 1rem;max-width:1100px;color:#182b35;background:#fafafa}
button{font:inherit;text-align:left;padding:.6rem;margin:.2rem;border:1px solid #9baeb7;border-radius:5px;background:white;cursor:pointer}
button:focus-visible{outline:3px solid #087f8c}pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:1rem;background:#edf2f4}
nav{display:flex;flex-wrap:wrap}h1,h2{color:#075c68}</style>
<h1>¿Estas declaraciones expresan el contrato?</h1>
<p>PROTOTIPO PARCIAL. Explora usos compartidos, nombres, tipos, composición y fuentes separadas.
Los botones muestran grafos y resultados registrados por Python/SHACL; no ejecutan CEL ni un mock HTTP.</p>
<p>Recorrido sugerido: ejemplo válido → nombres duplicados → ciclo anidado → ciclo por referencia → fuente canónica.</p>
<nav aria-label="Casos comprobados">""" + buttons + """</nav>
<section aria-live="polite"><h2 id="name"></h2><p id="status"></p><pre id="issues"></pre></section>
<details open><summary>Fuente semántica del caso</summary><pre id="semantic"></pre></details>
<details><summary>Fuente de mocking del caso</summary><pre id="mocking"></pre></details>
<script>const cases=""" + data + """;
function show(index){const c=cases[index];for(const key of ['name','semantic','mocking'])document.getElementById(key).textContent=c[key];
document.getElementById('status').textContent=c.conforms?'Aceptado por las comprobaciones de este prototipo':'Rechazado como se esperaba';
document.getElementById('issues').textContent=c.issues.join('\\n')||'Sin incidencias en las comprobaciones implementadas.'}show(0);
</script></html>""", encoding="utf-8")
    print(f"{len(cases)} casos correctos. Abrir report.html. Alcance: README.md.")


if __name__ == "__main__":
    main()
