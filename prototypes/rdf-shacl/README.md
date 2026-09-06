# Prototipo desechable: vocabulario RDF y shapes SHACL

Estado: **borrador para revisión**, no ontología aprobada ni cargador completo.
Pregunta: ¿la estructura expresa campos reutilizables, usos compartidos o anónimos,
composición anidada y fuentes de mocking separadas conforme a las decisiones acordadas?

Ticket: [Concretar los vocabularios RDF y las shapes SHACL de la primera entrega](https://github.com/TalbyAI/talby-domain/issues/4).

## Ejecutar

Entrar primero en esta carpeta. Todos los comandos siguientes se ejecutan aquí:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python check.py
```

Abrir `report.html` con doble clic. Contiene casos y grafos registrados: permite
inspeccionarlos sin servidor, pero los cambios en Turtle se verifican ejecutando de nuevo el comando.
`results/` y `.venv/` son locales y desechables. No hay dependencias de otros prototipos.

## Decisiones que representa

- IRIs estables independientes del nombre para declaraciones nombradas.
- `Field`: nombre por defecto, un tipo, restricciones y secuencia de normalizadores.
- `FieldUse`: referencia a un campo, nombre opcional y restricciones adicionales;
  reutilizable entre agrupaciones, sin normalizadores locales.
- Usos y restricciones sin orden semántico; normalizadores en una lista RDF.
- Blank nodes admitidos para usos, incluso compartidos. La fuente canónica les asigna
  IRIs que quedan guardadas; recargar esa fuente conserva identidad y reutilización.
  Volver a generar desde el original anónimo no garantiza las mismas IRIs.
- Nombres efectivos únicos dentro de cada agrupación; ejemplos de reglas sobre nombres locales.
- Referencias y colecciones con tipos explícitos. Ciclos de composición prohibidos;
  los ciclos mediante referencias a entidades están permitidos.
- Mocking opcional separado, con condición CEL y una respuesta o error JSON fijo.
- Escenarios para comandos y queries explícitos; CRUD conserva su comportamiento derivado.
- Propiedades no reconocidas rechazadas. `rdfs:label` y `rdfs:comment` admiten texto,
  con o sin idioma, en ambas fuentes; se conservan y no alteran el comportamiento.
  Otras extensiones necesitan soporte explícito.
- `ValueType` tiene una base primitiva o de otro tipo de valor y conserva sus restricciones.
  No se admiten ciclos. Una enumeración añade una restricción `OneOf`.

## Propuesta concreta de propiedades y cardinalidades

Los nombres y la ubicación de las comprobaciones son propuestas, no decisiones aprobadas.
Los namespaces `example.org` son marcadores del prototipo, no una decisión de publicación.

| Declaración | Propiedades propuestas |
| --- | --- |
| `Field` | `name` 1, `valueType` 1, `constraint` 0..N, `normalizers` 0..1 lista |
| `FieldUse` | `field` 1, `name` 0..1, `constraint` 0..N; `normalizers` prohibido |
| `FieldGroup` | `name` 1, `uses` 0..N, `constraint` 0..N |
| `CollectionType` | `itemType` 1 |
| `EntityReference` | `targetEntity` 1 |
| `ValueType` | `baseType` 1 escalar, `constraint` 0..N |
| `OneOf` | `allowedValue` 1..N literales |
| `MaxLength` | `limit` 1 entero no negativo |
| `Assertion` | `expression` 1 cadena CEL no vacía |
| `Scenario` | `operation` 1, `when` 1, exactamente una de `responseJson` / `errorJson` |

`Entity`, `Command`, `Query` y `ReadModel` se representan aquí como especializaciones de
`FieldGroup`; la jerarquía completa también está pendiente de revisión.
Los JSON se transportan aquí como cadenas Turtle; el tipo literal definitivo no está aprobado.
Las shapes admiten referencias a comandos y queries explícitos. `DerivedCrudOperation`
es un marcador experimental usado para comprobar la exclusión de CRUD, incluso cuando
la operación también está tipada como comando; no decide la representación de los contratos
derivados, que corresponde al ticket del modelo efectivo. No se ejecuta SQLite en esta prueba.

## Qué comprueba y qué no

Las shapes comprueban tipos RDF, presencia/cardinalidad de las propiedades anteriores,
referencias declaradas, nombres efectivos duplicados y ciclos de composición.
Dos shapes usan SHACL-SPARQL para estos últimos casos. Es una ubicación experimental:
no obliga a usar SPARQL en el verificador de producción. El script comprueba además
separación de fuentes, propiedades desconocidas, listas de normalizadores bien formadas y sintaxis JSON.

El paso canónico sustituye únicamente blank nodes tipados `FieldUse`; las celdas
auxiliares de listas RDF siguen siendo anónimas. No es canonicalización de grafos
para hashing ni un algoritmo de identidad por contenido. La identidad exige conservar
el artefacto producido, sin sobrescribir el original.

No se evalúa CEL ni se verifica todavía su entorno de nombres, funciones o tipos.
No se ejecuta normalización ni se comprueba la acumulación efectiva de restricciones
o la validez de datos `Periodo`. Las dos restricciones de título se conservan en el grafo,
pero aún no se ejecutan sobre un payload.
Se analiza JSON, **no se valida todavía contra el resultado o error de la operación**.
Tampoco se ejecutan condiciones ni los casos de cero/una/varias coincidencias.

Los tipos de valor y las enumeraciones se comprueban estructuralmente. Se verifica que
la cadena de bases conserva las referencias a restricciones; no se ejecuta su conjunción.
Faltan la compatibilidad de cada restricción con el tipo base y la homogeneidad,
canonicalización e intersección de los valores de enumeraciones conforme al perfil aprobado.

No se definen todavía módulo/features, presencia/null,
identificadores de entidad completos, permisos, errores declarados, eventos, contratos completos de queries,
CRUD, HTTP, SQLite ni el catálogo completo de restricciones. El ejemplo de entidad
es deliberadamente incompleto; no constituye el caso de aceptación del servicio entero.
Las shapes son abiertas: el script rechaza propiedades desconocidas, pero aún no se
detectan todas las propiedades conocidas fuera de lugar.

## Fuentes técnicas

- [SHACL, W3C](https://www.w3.org/TR/shacl/): formas estructurales y restricciones SPARQL.
- [RDF 1.1: sustitución de blank nodes por IRIs](https://www.w3.org/TR/rdf11-concepts/#section-skolemization).
- [pySHACL](https://github.com/RDFLib/pySHACL): validador usado únicamente en este prototipo.

La forma de autoría, las cardinalidades propuestas y las políticas del contrato son
elecciones de este proyecto, no requisitos impuestos por estos estándares.
