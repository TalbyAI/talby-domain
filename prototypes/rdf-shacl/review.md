# Revisión conjunta: vocabulario de contrato y mocking

Estado: **aprobado por el usuario en la revisión conjunta**, incluidos nombres,
cardinalidades, parámetros y bases de IRI. Este documento reúne la decisión RDF y
explicita su alcance. No es una implementación de producción.

## Artefactos para revisar

- `vocabulary.ttl`: clases, primitivas, propiedades y constantes.
- `shapes.ttl`: restricciones estructurales y algunas comprobaciones de grafo.
- `semantic.ttl`: ejemplo de clientes/proyectos, campos y usos compartidos, tipos,
  Periodo, identificadores, permisos, error, evento y comando.
- `mocking.ttl`: escenario separado con JSON fijo.
- `README.md`: tabla de propiedades/cardinalidades y límites exactos del experimento.
- `report.html`: casos registrados. No ejecuta un motor de contrato en el navegador.

## Forma aprobada

Se adoptan los nombres de clases y propiedades del vocabulario, salvo el marcador
experimental `DerivedCrudOperation`, y las cardinalidades de la tabla del README.
Los prefijos `c:` y `m:` son abreviaturas de autoría, no identidades.

Bases de IRI aprobadas, bajo la dirección del repositorio:

- Contrato: `https://github.com/TalbyAI/talby-domain/vocab/contract#`.
- Mocking: `https://github.com/TalbyAI/talby-domain/vocab/mocking#`.
- Shapes: `https://github.com/TalbyAI/talby-domain/vocab/shapes#`.

Son identificadores; no prometen publicar documentos descargables en esas rutas.
La carga sigue siendo explícita y no descarga una IRI al encontrarla.
El prototipo utiliza estas bases y conserva el resultado de su comprobación con ellas.
Tampoco se deben adoptar las IRIs
`urn:talby:prototype:declaration:` como formato obligatorio de las declaraciones de usuario.

`FieldGroup` se especializa en entidad, comando, query, evento y modelo de lectura.
El tipo de un campo es uno solo: primitivo, tipo de valor, agrupación, referencia a entidad
o colección. Las especializaciones aportan sus datos y reglas; sus metadatos no son payload.
Una referencia usa el identificador de entidad y no carga sus datos ni comprueba existencia.

Los usos de campo pueden compartirse entre agrupaciones; los miembros de una agrupación
y sus restricciones son conjuntos. Las secuencias de normalizadores usan listas RDF.
Los blank nodes se admiten para `FieldUse` y para estructuras auxiliares como listas;
los usos reciben IRIs persistidas al producir la fuente canónica. Guardar el resultado
conserva identidad; regenerarlo desde una fuente anónima no promete las mismas IRIs.

## Parámetros de restricciones

| Restricción | Parámetros | Comprobación del significado |
| --- | --- | --- |
| `Required`, `Nullable` | `enabled`: booleano | Defaults en Field; conjunción acumulativa en sus usos |
| `MinLength`, `MaxLength` | `limit`: entero ≥ 0 | Longitud en valores escalares Unicode; reglas del identificador cuando corresponda |
| `MinItems`, `MaxItems` | `limit`: entero ≥ 0 | Número de elementos de la colección, incluidos null admitidos |
| `Precision` | `limit`: entero 1..4096 | Precisión del valor decimal según el perfil aprobado |
| `Scale` | `limit`: entero 0..4096 | Escala del valor decimal; no formato de presentación |
| `Range` | `lower` y/o `upper`; flags booleanos de inclusión, default true | Tipo compatible, extremos válidos, intervalo no vacío |
| `Pattern` | `pattern`: cadena | Coincidencia completa y subconjunto portable aprobado |
| `Prefix`, `Suffix` | `text`: cadena literal, incluso vacía | Prefijo/sufijo sin regex; alfabeto y solapamiento según el tipo |
| `OneOf` | `allowedValue`: uno o varios literales | Tipo escalar homogéneo, canonicalización y pertenencia exacta |
| `Assertion` | `expression`: cadena CEL | Entorno tipado, resultado booleano y perfil de funciones/sintaxis aprobado |

Se usan literales RDF nativos para parámetros escalares: `xsd:string`,
`xsd:boolean`, `xsd:integer`, `xsd:decimal`, `xsd:date` y `xsd:dateTime`.
Los extremos de rango se limitan a los cuatro últimos tipos. El verificador comprueba
su correspondencia con el tipo al que se aplica la regla y las restricciones léxicas
del perfil; reconocer un datatype XSD no basta para admitir cualquier valor suyo.
La precisión temporal no debe perderse durante la carga antes de poder comprobarla.
Los decimales HTTP/JSON siguen siendo cadenas: esta elección de literal RDF no los convierte
en `number` ni permite redondearlos.

Todas las reglas conservan su IRI. Las restricciones del tipo, campo y uso se acumulan;
no se reemplazan por la última regla. Las de una agrupación se evalúan en el contexto
de cada inclusión. Las aserciones infieren las referencias afectadas de su árbol comprobado,
sin lista manual. Un valor inválido bloquea solo las aserciones dependientes.

El perfil de Identifier conserva alfabeto ASCII `[A-Za-z0-9_-]`, longitud total
1..128 por defecto, prefijo explícito (puede ser vacío) y sufijo vacío por defecto.
Se representa mediante restricciones del campo identificador, su tipo de valor o su uso;
la referencia a entidad conserva el contrato efectivo de ese identificador.
La elección y capacidad de un generador no pertenecen a este vocabulario de contrato.

## Reparto de responsabilidades

| Responsabilidad | Ubicación |
| --- | --- |
| Términos, cardinalidades, parámetros y fuentes semántica/mocking | Este ticket |
| Detectar propiedades desconocidas o conocidas fuera de lugar | Conformidad del vocabulario; la implementación del prototipo aún es parcial |
| Comprobar referencias, tipos, funciones, contradicciones detectables y constantes | Verificación semántica; el comportamiento ya está especificado, falta implementación completa |
| Sintaxis JSON y conformidad de respuesta/error/éxito con la operación | Carga/verificación de mocking; el prototipo solo cubre una parte |
| Modelo efectivo inspeccionable, procedencia de defaults, CRUD, PATCH y rutas derivadas | Ticket «Definir el modelo efectivo y los contratos CRUD derivados» |
| Estados, payloads y envoltorios HTTP, rutas de incidencias y selección de actor | Ticket «Concretar el contrato HTTP/JSON, errores y selección del actor de prueba» |
| Ejecución de autorización, CEL, normalización y persistencia | Implementación posterior con casos de aceptación |

`DerivedCrudOperation` es solo un marcador experimental de los casos negativos.
No forma parte del vocabulario de entrada aprobado: la forma del CRUD
derivado corresponde al ticket del modelo efectivo.

El grafo visual permanece separado conforme a la especificación y ADR-0006. Este ticket
pregunta por fuentes semántica y de mocking; no diseña el editor ni introduce propiedades
visuales en ellas. El vocabulario visual mínimo exigido debe concretarse en un ticket
propio del mapa antes de dar por decidida la entrega.

## Alcance de la aprobación

La aprobación ratifica la representación acordada y los nombres/cardinalidades/literales revisados;
no afirma que el prototipo sea un verificador exhaustivo. Los casos registrados son
evidencia acotada y sus límites figuran en el README. La revisión humana del conjunto
ha concluido; la resolución del ticket enlaza esta decisión y la evidencia reproducible.
