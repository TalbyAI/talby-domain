# Formas léxicas y catálogo inicial de funciones

Investigación y decisión propuesta, 6 de septiembre de 2026. Contexto: [Decidir las formas léxicas y el catálogo inicial de funciones](https://github.com/TalbyAI/talby-domain/issues/2). Este documento es un activo de investigación; la resolución de ese ticket es el registro canónico de la decisión. No contiene una implementación ni decide adoptar CEL.

## Base y resultado

Se han leído [la especificación](../specification.md), [el lenguaje del contexto](../../CONTEXT.md), [restricciones acumulativas](../adr/0004-restricciones-acumulativas.md) e [identidad independiente del namespace](../adr/0005-identidad-independiente-del-namespace.md). El perfil siguiente concreta sus cuestiones abiertas. Conserva las cadenas para decimal, fecha, instante e identificador; normalización antes de restricciones; ausencia distinta de `null`; y acumulación de reglas.

**Recomendación:** distinguir entrada léxica aceptada, valor tipado y salida canónica. Decimal e instante llevan una canonicalización intrínseca visible en el modelo efectivo; `trim` es opcional y declarado. La escala escrita de un decimal no constituye información del valor: `1.20` y `1.2` representan el mismo valor. Si una futura necesidad exige preservar presentación o precisión medida, necesitará otro campo o tipo de valor.

Todo lo señalado como **perfil** es una elección de este proyecto, no una exigencia de un estándar. Las firmas son contratos abstractos de comportamiento, no nombres RDF, API TypeScript ni sintaxis CEL definitivos.

## Qué establecen las fuentes

- JSON permite límites de implementación sobre números; el intervalo entero interoperable con binary64 es ±9 007 199 254 740 991. Su gramática puede admitir secuencias UTF-16 aisladas como escapes, con comportamiento impredecible entre implementaciones. Esto justifica comprobar enteros y texto antes de tratarlos como valores del contrato. [RFC 8259, números](https://www.rfc-editor.org/rfc/rfc8259#section-6), [Unicode](https://www.rfc-editor.org/rfc/rfc8259#section-8.2).
- XSD separa espacios léxico y de valores. `decimal` no requiere coma flotante; `totalDigits` y `fractionDigits` restringen valores, no ceros redundantes escritos. En XSD 1.1, `totalDigits=t` exige una representación `i/10^n` con `abs(i)<10^t` y `0≤n≤t`; por ello `0.001` requiere al menos tres, no un único dígito. Su representación decimal canónica omite el punto para valores enteros y lo conserva para valores fraccionarios. La gramática de entrada del perfil es más restrictiva: rechaza `+1`, `.1` y `1.`; aceptación léxica y canonicalización son decisiones separadas. [XSD decimal](https://www.w3.org/TR/xmlschema11-2/#decimal), [totalDigits](https://www.w3.org/TR/xmlschema11-2/#rf-totalDigits), [fractionDigits](https://www.w3.org/TR/xmlschema11-2/#rf-fractionDigits).
- RFC 3339 admite desplazamientos, fracción opcional y segundos intercalares bajo condiciones. `-00:00` expresa que el desplazamiento local es desconocido, aunque se conoce el tiempo UTC. El año usa cuatro dígitos; el calendario es gregoriano. Un perfil puede restringir estas opciones. [RFC 3339, formato y restricciones](https://www.rfc-editor.org/rfc/rfc3339#section-5.6), [desplazamiento desconocido](https://www.rfc-editor.org/rfc/rfc3339#section-4.3).
- ECMAScript `trim` elimina WhiteSpace y LineTerminator en los extremos y aplica conversión a texto; el catálogo aquí conserva el conjunto de caracteres, pero rechaza esa coerción. [TrimString](https://tc39.es/ecma262/multipage/text-processing.html#sec-trimstring), [WhiteSpace](https://tc39.es/ecma262/multipage/ecmascript-language-lexical-grammar.html#sec-white-space).
- RE2 no admite referencias hacia atrás ni lookaround; sus repeticiones contadas tienen un límite de 1000. SHACL `sh:pattern` usa las expresiones de SPARQL y no equivale automáticamente a un validador de payload de otro motor. Un subconjunto explícito evita confundir estos contratos. [Sintaxis RE2](https://github.com/google/re2/wiki/Syntax), [SHACL pattern](https://www.w3.org/TR/shacl/#PatternConstraintComponent).
- CEL declara números `int`, `uint` y `double`, y mecanismos de extensión. La disponibilidad real de tipos y funciones decimales equivalentes queda para el prototipo previsto, no se deduce del lenguaje. [Definición CEL](https://github.com/cel-expr/cel-spec/blob/master/doc/langdef.md#numeric-values).

## Texto, booleano y entero

**Perfil:** texto es una secuencia de valores escalares Unicode. Se rechazan sustitutos UTF-16 aislados en la frontera de entrada; no se aplica NFC, case folding ni una transformación dependiente del locale. Longitud significa número de valores escalares, no bytes, unidades UTF-16 ni grafemas. `😀` mide uno; `e` seguido de U+0301 mide dos y es distinto de `é`. El identificador ASCII tiene la misma longitud en estas unidades.

Booleano solo acepta los valores JSON `true` y `false`. Entero acepta un número JSON finito, matemáticamente entero y dentro del intervalo aprobado. `1.0` y `1e0` son números enteros tras decodificar JSON; `"1"` no lo es. Cero negativo numérico se representa como cero. Un adaptador que recibe un número ya redondeado por un decodificador no puede recuperar su escritura original; el contrato valida el valor JSON decodificado, no certifica la exactitud del lexema numérico previo. Para datos cuyo lexema deba conservar exactitud se utiliza decimal como cadena.

## Decimal exacto

**Perfil de entrada**, sobre toda la cadena: `-?[0-9]+(\.[0-9]+)?`. Los dígitos son ASCII. Se aceptan ceros iniciales y finales para canonicalizarlos. Se rechazan `+`, espacios, exponente, separadores de miles, coma, `.5`, `1.`, NaN e infinito. Un número JSON nunca se convierte a decimal.

**Canonicalización obligatoria:** quitar ceros iniciales de la parte entera dejando uno si queda vacía; quitar ceros finales de la fracción; quitar el punto si no queda fracción; quitar `-` cuando el valor es cero. No se redondea ni se pasa por `number`/`double`. La salida es `0` o una cadena que cumple la gramática anterior, sin ceros redundantes. Para las entradas aceptadas, esta canonicalización sigue la forma canónica de `xsd:decimal` en XSD 1.1; cualquier mapeo RDF futuro debe ser explícito.

**Precisión y escala de valor:** para el decimal canónico, `s` es la longitud de la fracción (cero si no existe). Sea `i` el entero formado al retirar punto y ceros iniciales, con un dígito para cero. Definir `p=max(dígitos(abs(i)),s,1)`. Una declaración `precision=P` exige `p≤P`; `scale=S` exige `s≤S`. Es la semántica de límite de valor de XSD 1.1, no una obligación de escribir exactamente S decimales, ni la capacidad de columnas SQL `DECIMAL(P,S)`.

`P` es entero positivo, `S` entero no negativo; en este perfil ambos tienen techo 4096. Omitir cualquiera no introduce una restricción de negocio para ese parámetro. Al resolver una declaración o composición, si ambos límites existen, el límite de escala efectivo es `min(S,P)`; por tanto `S>P` se normaliza a `P` y no se rechaza. Esta normalización forma parte del contrato y la aplican igual cliente y motor. Al acumular límites se utiliza el más restrictivo.

**Límite operativo de perfil propuesto:** máximo 4096 dígitos ASCII en la entrada decimal, contando ceros redundantes y excluyendo signo/punto. No es un default de precisión o escala del dominio. Se comprueba antes de construir enteros grandes; cliente y motor aplican el mismo techo. Declaraciones que exijan capacidades superiores no son soportadas por este perfil y se detectan en verificación. Cambiar el techo requiere otro perfil efectivo explícito; nunca truncar. Esta elección limita recursos, no deriva de las fuentes ni promete exactitud ilimitada. Los dos límites son independientes: declarar scale=4096 es un máximo permitido, pero no garantiza representar un valor no nulo de escala exactamente 4096, pues el cero entero obligatorio consumiría otro dígito léxico.

| Entrada | Canon | p | s | Observación |
| --- | --- | --- | --- | --- |
| `0001.2300` | `1.23` | 3 | 2 | Conserva el valor |
| `-0.000` | `0` | 1 | 0 | Un único cero |
| `0.001` | `0.001` | 3 | 3 | Rechaza precision=2 |
| `1000.00` | `1000` | 4 | 0 | No cuenta ceros de presentación |
| `12.340` | `12.34` | 4 | 2 | Acepta scale=2 |
| `12.345` | `12.345` | 5 | 3 | Rechaza scale=2; no redondea |
| `9007199254740993.01` | Igual | 18 | 2 | Exactitud superior a number |
| `1e2`, `+1`, `1.`, `.1`, número JSON `1` | Error | — | — | Formato o tipo incorrecto |

## Fecha civil

**Perfil:** exactamente diez caracteres ASCII `YYYY-MM-DD`, año 0001–9999, mes 01–12, día válido en calendario gregoriano proléptico. Año divisible por 4 es bisiesto salvo siglos no divisibles por 400. No se admiten año cero, años con signo, fecha ordinal, semana ISO, hora ni zona. La fecha se conserva; no se interpreta como medianoche de una zona.

Comparar por tupla `(año,mes,día)` o por la cadena canónica da el mismo orden. `2000-02-29` es válida; `1900-02-29`, `2025-02-29`, `2026-04-31`, `2026-9-06` y `0000-01-01` se rechazan. No delegar la validación a un parser que ajuste días inexistentes.

## Instante

**Perfil de entrada:** fecha válida del apartado anterior, `T` mayúscula, hora `HH:mm:ss`, fracción opcional `.[0-9]+`, y `Z` mayúscula o desplazamiento `+HH:mm` / `-HH:mm`. Hora 00–23, minutos y segundos 00–59; desplazamiento de 00:00 a 23:59. Se rechaza `-00:00` para no descartar su significado de desconocimiento. No se admiten `t`/`z`, espacio por T, hora local sin zona, `24:00:00`, segundos intercalares ni anotaciones de zona.

La entrada con desplazamiento expresa un instante; se resta ese desplazamiento y se produce exactamente `YYYY-MM-DDTHH:mm:ss.sssZ`. La conversión debe conservar año UTC entre 0001 y 9999; desbordamientos se rechazan. La fracción ausente equivale a `.000`; una o dos cifras se completan con ceros. Más de tres cifras solo se acepta cuando **todas** las posteriores a la tercera son cero. Techo operativo propuesto: 4096 cifras de fracción, comprobado antes de procesarla. Se rechaza pérdida de precisión, sin redondeo.

La regla de fecha/hora se verifica antes de convertir. No usar el locale ni la zona del proceso, reloj, calendario de segundos intercalares o consulta externa. Los milisegundos pueden compararse exactamente como enteros en el rango del perfil; también se pueden comparar las cadenas UTC canónicas. No comparar cadenas de entrada con offsets diferentes.

| Entrada | Resultado |
| --- | --- |
| `2026-09-06T12:34:56+02:00` | `2026-09-06T10:34:56.000Z` |
| `2026-01-01T00:15:00+01:00` | `2025-12-31T23:15:00.000Z` |
| `2026-09-06T00:00:00.12Z` | `2026-09-06T00:00:00.120Z` |
| `2026-09-06T00:00:00.123000Z` | `2026-09-06T00:00:00.123Z` |
| `2026-09-06T00:00:00.123001Z` | Error de precisión |
| `2016-12-31T23:59:60Z` | Error de formato del perfil |
| `0001-01-01T00:00:00+01:00` | Error de rango UTC |
| `2026-09-06T00:00:00-00:00` | Error de desplazamiento no admitido |

## Identificador de entidad

**Perfil:** una cadena no vacía formada exclusivamente por `[A-Za-z0-9_-]`; longitud total inclusiva, con defaults 1 y 128 resueltos al declarar el tipo. `prefix` es explícito por entidad (puede declararse vacío); `suffix` omitido equivale a vacío. Ambos deben usar el mismo alfabeto. Se exige que el valor empiece/termine exactamente con ellos, con comparación sensible a mayúsculas.

Prefijo y sufijo son restricciones literales, no regex; no se quitan al almacenar o comparar. Pueden solaparse: con prefijo `ab` y sufijo `bc`, `abc` es válido si cumple longitud. No se impone una longitud adicional a una supuesta parte central. El generador técnico puede exigir más espacio, pero esa capacidad se comprueba aparte. Una referencia exige el tipo de entidad esperado y todas las restricciones de su identificador; no comprueba existencia.

`prj_A-1` y `prj_a-1` son distintos; `prj_á`, espacios y controles fallan. No hay lowercase, ULID ni UUID implícito. Una cadena inválida con espacios solo puede recuperarse si el modelo declara explícitamente `trim`. Los identificadores de declaración RDF son otro concepto y no se restringen con este alfabeto.

Al verificar, los límites deben ser enteros, mínimo≥1 y máximo≥mínimo. Prefijos/sufijos incompatibles entre reglas o ningún valor posible bajo el máximo son contradicciones; no basta sumar sus longitudes porque pueden solaparse. Una implementación puede comprobar satisfacibilidad de las posiciones exigidas por ambos para las longitudes candidatas. No se introduce un máximo de negocio global por encima del máximo elegido por entidad; límites de payload pertenecen al contrato técnico común.

## Normalización y ausencia

**Perfil:** `normalize(model,input)` devuelve un valor normalizado o incidencias. Primero comprueba estructura y tipos JSON, distinguiendo ausencia, `null` y valor. Sobre valores presentes no nulos ejecuta los normalizadores declarados, en orden, y después canonicalización del tipo. Todos los normalizadores iniciales operan sobre cadena; no convierten números, objetos o booleanos. Una cadena se somete a `trim` antes de analizar decimal/fecha/instante si esa regla está declarada.

`trim(s:String) -> String` elimina exclusivamente el siguiente conjunto fijo en ambos extremos, hasta encontrar otro carácter:

`U+0009–U+000D, U+0020, U+00A0, U+1680, U+2000–U+200A, U+2028, U+2029, U+202F, U+205F, U+3000, U+FEFF`.

No elimina U+0085, U+180E ni U+200B; no cambia espacios interiores. La tabla es parte del perfil, sin depender de futuras tablas Unicode del runtime. `trim(null)` invocado directamente es error de tipo; el pipeline no lo invoca sobre `null` ni ausencia. `trim(" \u00A0x\uFEFF")` produce `x`; `trim("x y")` conserva el espacio interior; una cadena solo de espacios del conjunto produce vacío.

La canonicalización decimal e instante es intrínseca y aparece en el modelo efectivo, después de las reglas de texto declaradas. Fecha e identificador no tienen otra transformación intrínseca. Esto fija un único orden y mantiene la salida del tipo canónica. En el catálogo inicial solo se admite `trim` como normalizador configurable: sus repeticiones y su composición con las canonicalizaciones son idempotentes. No se presume que futuros normalizadores individualmente idempotentes formen un pipeline idempotente; añadirlos requiere demostrar esa propiedad de la composición.

Tras normalizar se aplican todas las restricciones y después las reglas entre campos que tengan entradas válidas. No se inventan valores ausentes ni defaults de datos. En mensajes de cambios parciales se conserva la semántica ya aprobada de sustitución de agrupaciones y validación del estado resultante; este perfil no convierte campos obligatorios en opcionales.

## Firmas y semántica del catálogo inicial

`Result<T>` significa éxito con T o error estructurado; `Check` significa conformidad o incidencias, no un booleano que confunda incompatibilidad con incumplimiento. Los nombres siguientes son las identidades lógicas del catálogo pendiente de materializar. `Decimal`, `Date`, `Instant` e `EntityId<E>` son valores tipados representados por cadenas; `String` no se acepta implícitamente donde se requiere uno de ellos.

| Función | Firma abstracta | Semántica |
| --- | --- | --- |
| `decimal` | `(String) -> Result<Decimal>` | Gramática, límite operativo y canonicalización anteriores |
| `date` | `(String) -> Result<Date>` | Fecha válida; conserva cadena |
| `instant` | `(String) -> Result<Instant>` | Canon UTC exacto y límites anteriores |
| `entityId` | `(EntityType, String) -> Result<EntityId<E>>` | Alfabeto y restricciones efectivas del tipo; sin existencia |
| `trim` | `(String) -> String` | Conjunto fijo de extremos |
| `required` | `(Presence, Boolean) -> Check` | Si true, ausencia falla; `null` cuenta como presente |
| `nullable` | `(PresentValue, Boolean) -> Check` | Si false, `null` falla; no hace obligatorio un campo |
| `length` | `(String, min?, max?) -> Check` | Número de valores escalares; límites inclusivos |
| `range` | `(T, lower?, upper?, lowerInclusive=true, upperInclusive=true) -> Check` | T entero, decimal, fecha o instante; extremos del mismo tipo |
| `precision` | `(Decimal, P) -> Check` | p≤P según definición anterior |
| `scale` | `(Decimal, S) -> Check` | s≤S; sin rellenar ni redondear |
| `pattern` | `(String, Pattern) -> Check` | Coincidencia completa con el subconjunto siguiente |
| `oneOf` | `(T, List<T>) -> Check` | Pertenencia exacta a un conjunto no vacío de escalares del mismo tipo |
| `cardinality` | `(List<T>, min?, max?) -> Check` | Número de elementos, incluidos `null` si el elemento lo admite |
| `compareDecimal` | `(Decimal, Decimal) -> -1\|0\|1` | Comparación numérica exacta, sin number |
| `compareDate` | `(Date, Date) -> -1\|0\|1` | Orden civil |
| `compareInstant` | `(Instant, Instant) -> -1\|0\|1` | Orden temporal UTC |
| `assert` | `(TypedExpression<Boolean>, FieldPaths) -> Check` | True cumple; false produce incidencia en las rutas declaradas; error de evaluación se distingue |

Las funciones de parseo son explícitas en expresiones; los adaptadores de campos las aplican por el tipo declarado y muestran esa operación en el contrato efectivo. Validadores `length`, `pattern` y demás no canonicalizan ni hacen coerción. Un valor con fallo de tipo/formato no se suministra a reglas que requieren ese tipo; se evitan incidencias derivadas falsas sin omitir reglas de otros campos válidos.

`oneOf` compara texto e identificadores por secuencia exacta; decimal por valor canónico, fecha por fecha e instante por instante canónico. Los literales de la enumeración se comprueban/canonicalizan al verificar el modelo; duplicados tras ese proceso se rechazan como declaración redundante. Listas u objetos no son miembros de enumeraciones de este perfil.

Los límites de longitud/cardinalidad son enteros no negativos; extremos numéricos/temporales se validan al declarar. Rango sin ningún extremo y longitud/cardinalidad sin límites son declaraciones vacías y se rechazan. Se rechazan intervalo invertido, intervalo abierto reducido a un punto y referencias de campo/funciones inexistentes. El conjunto efectivo es la conjunción de restricciones, nunca el último valor escrito. No se promete resolver satisfacibilidad de expresiones arbitrarias; se comprueban contradicciones estructurales y de límites detectables.

`required=false` no anula un true heredado; `nullable=true` no anula un false heredado. Los mínimos efectivos crecen y los máximos decrecen. Los patrones y expresiones originales permanecen; las enumeraciones se intersectan. Los normalizadores heredados se conservan antes de los añadidos en cada uso; no se puede sustituir su orden silenciosamente.

No se necesita todavía aritmética decimal general para comprobar un importe y `fin>=inicio`: bastan comparación exacta y constantes tipadas. División, redondeo, calendarios, conversión de moneda, generación de identificadores y consultas externas quedan fuera del catálogo inicial. Si el prototipo descubre una regla de aceptación que las exige, habrá una nueva decisión sobre esa operación, sin heredar defaults del motor de expresiones.

## Perfil de patrones

**Elección:** coincidencia de toda la cadena, sensible a mayúsculas, sin flags ni locale. Se aceptan literales escalares Unicode, concatenación, alternancia `|`, grupos `(...)` y `(?:...)`, clases positivas de caracteres ASCII con rangos ASCII, y repeticiones `?`, `*`, `+`, `{n}`, `{n,m}`, `{n,}`. Los límites contados son enteros no negativos, no superan 1000 y cumplen n≤m cuando aparecen ambos; cada átomo admite como máximo un cuantificador. Los metacaracteres se pueden escapar literalmente; `\n`, `\r` y `\t` representan esos caracteres. Dentro de una clase, guion literal va escapado o al inicio/final; `]` y barra inversa se escapan.

Se rechazan comodín `.`, clases negadas, `\w`/`\d`/`\s`, propiedades Unicode, límites de palabra, backreferences, lookaround, flags, cuantificadores lazy/posesivos y anclas interiores. Se permite un único `^` inicial y `$` final opcionales como escritura redundante de coincidencia completa; no alteran la semántica. El punto literal se escribe `\.`. El parser del perfil rechaza cualquier sintaxis no listada, antes de llegar al runtime; no basta que un motor acepte el patrón.

La coincidencia completa exige consumir también un salto de línea final: no implementar solo añadiendo `$`, cuya semántica puede permitir una coincidencia anterior al salto. Capturas no son observables. La operación debe comportarse por valores escalares y ofrecer ejecución sin backtracking exponencial; cómo conseguirlo en TypeScript y el otro runtime es materia del prototipo.

El patrón exploratorio de `samples/projects.md`, `^([\w-]+)(\.([\w-]+))*$`, se expresa en este perfil como `[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*`. Es una traducción para intención ASCII; no una afirmación de equivalencia con todas las variantes Unicode de `\w`. Acepta `uno.dos-3`; rechaza `.uno`, `uno..dos`, `uno.` y `uno\n` (salto real).

## Casos de conformidad que debe recibir el prototipo

Las tablas anteriores son vectores de contrato, no pruebas ejecutadas. El prototipo debe materializarlos como datos compartidos y ejecutar al menos:

1. Igual éxito/error y canon en cliente y motor para cada límite decimal, fecha, instante e identificador; una cifra no cero después del milisegundo debe fallar.
2. `N(N(x))=N(x)` en valores válidos, incluidos `trim` antes de decimal/instante, cadenas vacías y dos inclusiones de una misma agrupación. El segundo paso usa la misma declaración efectiva.
3. Entero fuera de rango, booleano como cadena, sustituto Unicode aislado, longitud de emoji/combinación y límites inclusivos/exclusivos.
4. Las cuatro combinaciones required/nullable sobre ausencia, `null` y valor: ausencia solo depende de required; `null` presente solo de nullable; valor sigue las reglas del tipo.
5. Restricciones heredadas más añadidas, enumeraciones que se vacían, rangos contradictorios y campos desconocidos. Un mal campo no impide informar sobre otro independiente.
6. `r1=decimal("0.1")` y `r2=decimal("0.10")`; solo si ambos resultados son éxito se ejecuta `compareDecimal(r1.value,r2.value)=0`. Si cualquiera es error, el caso produce un error de parseo y no invoca `compareDecimal`; además, comparación con valores superiores al entero seguro; `compareDate(fin,inicio)>=0`; offsets diferentes que expresan el mismo instante.
7. Longitud total de identificador 1/128/129 bajo defaults; prefijo/sufijo, solapamiento y diferencia de mayúsculas; referencia con formato válido no consulta existencia.
8. Patrón con salto final, Unicode astral literal, sintaxis no admitida y entrada adversaria para comprobar la garantía de ejecución elegida.
9. 4096 dígitos decimales frente a 4097, contando ceros redundantes; fracción temporal con esos tamaños; ningún lado aplica un techo secreto menor.

## Qué queda para otras decisiones

La investigación permite cerrar la elección de gramáticas y semántica con este perfil si se adopta en el ticket. No queda una pregunta factual que impida la evaluación de expresiones. El techo 4096 es una política propuesta y revisable con evidencia del prototipo, no una capacidad medida.

Permanecen en sus trabajos correspondientes: viabilidad de las funciones/regex en CEL y TypeScript; nombres RDF/shapes, APIs exportadas y diagnóstico estable de funciones; códigos y sintaxis de rutas de incidencias, orden público de errores y límites generales de payload; almacenamiento exacto en SQLite; informe de compatibilidad del perfil. No son dependencias para especificar las reglas de esta investigación. Ninguna implementación se considera ya verificada.
