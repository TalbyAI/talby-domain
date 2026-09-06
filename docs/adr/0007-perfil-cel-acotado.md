# Perfil acotado de CEL para la primera entrega

Decisión aprobada por el usuario el 6 de septiembre de 2026. Su incorporación se somete a revisión mediante pull request; el cierre de [Evaluar un perfil portable de CEL para la capa de contrato](https://github.com/TalbyAI/talby-domain/issues/3) se realizará al fusionarlo.

## Decisión y alcance

Adoptar un perfil acotado de CEL para las aserciones de la capa de contrato de la primera entrega, con tipos y comparadores explícitos del host y **RE2JS para patrones en TypeScript**. La equivalencia requerida corresponde a este perfil, no a CEL completo ni a cualquier implementación del lenguaje.

La base sigue siendo [Decidir las formas léxicas y el catálogo inicial de funciones](https://github.com/TalbyAI/talby-domain/issues/2#issuecomment-5558105986), con su anexo normativo. No se debilitan las restricciones acumulativas de [la composición de modelos](0004-restricciones-acumulativas.md).

WASM está permitido como candidato, pero no es requisito del cliente. El paquete RE2-WASM evaluado se descarta para este uso sin adaptación por sus fallos de CSP y empaquetado. Esto no descarta WebAssembly en general. Go fue un motor de contraste independiente; no se elige el stack del motor de producción ni se adopta CEL definitivamente para otras entregas o capas.

## Responsabilidades del host

CEL aporta parseo, comprobación de firmas y composición/evaluación de expresiones. Decimal exacto, fecha civil, instante del perfil, canonicalizaciones, comparadores y validación estructural son responsabilidades del host, con resultados equivalentes entre motor y cliente.

El orden efectivo es: estructura, tipos y presencia; normalizadores declarados en orden; canonicalización intrínseca; restricciones acumulativas; aserciones cuyos campos tengan valores válidos. Ausencia y null son distintos. Un campo inválido no alimenta reglas dependientes, pero no impide informar errores independientes. El host conserva las rutas de las incidencias y distingue incumplimiento de una aserción (`false`) de error de evaluación.

Decimal exacto no pasa por number/double. Fecha civil no se interpreta en una zona horaria. Los instantes se expresan en UTC con precisión de milisegundos; cualquier entrada que perdería precisión al convertirla se rechaza sin redondeo. La evaluación no consulta reloj, red ni locale.

## Expresiones admitidas

- Literales bool, null, string e int; acceso a campos de un entorno declarado; `has`; negación, conjunción/disyunción y comparaciones escalares compatibles. Una aserción debe producir bool.
- Funciones explícitas del catálogo del host para tipos, comparadores y patrones. Los nombres de instrumentación del prototipo no fijan firmas públicas ni nombres RDF.
- El verificador del modelo comprueba las rutas y declara sus tipos efectivos. Un mapa dinámico usado para representar presencia no sustituye esa verificación.
- Decimal, fecha e instante se comparan mediante sus comparadores tipados, también para igualdad. Se rechaza igualdad directa entre esos tipos opacos: cel-go la admite, mientras que el candidato TypeScript evaluado la rechaza.
- Se excluyen aritmética general, double/uint, conversiones implícitas, matches/timestamp nativos, comprehensions, macros distintos de has, literales de colecciones, índices y condicionales. Colecciones, pertenencia, cardinalidad y otras restricciones del catálogo siguen siendo responsabilidades del host.

Funciones desconocidas, tipos incompatibles, sintaxis excluida y aserciones no booleanas se rechazan al verificar el modelo. Los patrones declarados también se comprueban y compilan en esa fase; que una biblioteca acepte un patrón no basta para admitirlo en el perfil.

## Patrones y límites operativos

Se conserva el subconjunto de patrones de la decisión léxica, con coincidencia completa, sensibilidad a mayúsculas y semántica por valores escalares Unicode. Un salto de línea final solo coincide si está incluido explícitamente en el patrón: `a`/`a\n` y `^a$`/`a\n` son falsos; `^a\n$`/`a\n` es verdadero. Un parser del perfil rechaza la sintaxis excluida antes de delegar en RE2JS o en el motor equivalente del servidor.

Los límites siguientes forman parte del perfil efectivo y son iguales en cliente y motor. Son límites de recursos por operación, no restricciones de negocio. Excederlos produce un rechazo explícito, sin truncamiento ni cambios silenciosos.

| Recurso | Límite |
| --- | --- |
| Dígitos léxicos de un decimal | 4096, conforme a la decisión anterior |
| Cifras de fracción temporal | 4096, conforme a la decisión anterior |
| Fuente de patrón | 4096 valores escalares Unicode, incluidas anclas opcionales |
| Grupos anidados del patrón | 32 |
| Repetición contada individual | 0–1000, conforme al perfil léxico |
| Producto de repeticiones contadas anidadas | 1000 |
| Coste estructural estimado expandido del patrón | 8192 unidades |
| Entrada de una evaluación de patrón | 65 536 valores escalares Unicode |
| Fuente CEL | 65 536 valores escalares Unicode |
| AST CEL | 1024 nodos y profundidad 64 |
| Paréntesis/prefijos unarios anidados en la fuente CEL | 64 |

El coste de patrón se define así: literal/clase = 1; alternancia = 1; grupo = interior + 1; ?, * y + suman 1; repetición finita multiplica por max(1,m); {n,} multiplica por n+1; concatenación suma. No representa bytes ni instrucciones reales del motor. El producto de repeticiones evita un límite oculto del parser Go; la comprobación de fuente CEL complementa la del AST porque los parsers simplifican de manera distinta.

RE2JS y Go regexp evitan backtracking exponencial por sus algoritmos. Los casos adversarios comprueban integración, no demuestran por sí solos una cota asintótica ni garantizan latencia constante. El presupuesto total por petición, número de reglas y límites generales de payload siguen en el contrato técnico correspondiente.

## Resultados y evidencia

La evidencia reproducible está conservada fuera de main en el commit [2285a58 del prototipo CEL portable](https://github.com/TalbyAI/talby-domain/tree/2285a58bd9c23c4778c1ed81de9f4821685de3f1/prototypes/cel-portable). El [informe del experimento](https://github.com/TalbyAI/talby-domain/blob/2285a58bd9c23c4778c1ed81de9f4821685de3f1/prototypes/cel-portable/README.md) conserva versiones, comandos, alcance y evidencias de ambos candidatos. Esta decisión prevalece sobre el estado de propuesta que figura en aquel activo histórico.

**217 casos compartidos coinciden con los resultados esperados en TypeScript/Node, cel-go y Chrome.** Incluyen decimal exacto, precisión/escala, calendario y offsets, límites 4096/4097, trim/idempotencia, required/nullable, Unicode, tipos JSON, identificadores, restricciones acumulativas, enumeraciones, campos desconocidos, errores independientes, Periodo anidado, sintaxis y límites de patrones y expresiones.

| Candidato probado | Resultado de navegador |
| --- | --- |
| CEL + RE2JS | 217 casos pasan en Chrome 152 con `script-src 'self'`, sin WASM/eval ni peticiones externas; Worker de prueba de 98 131 bytes gzip |
| CEL + RE2-WASM 1.0.2 | Falla con `wasm-unsafe-eval` por uso de `new Function`; permitir eval en una prueba negativa revela además `WrappedRE2 is not a constructor` |

No se parcheó el paquete WASM ni se propone debilitar la CSP. Las implementaciones probadas son cel-js 8.0.0, cel-go 0.26.1, RE2JS 2.8.6 y RE2-WASM 1.0.2; cualquier cambio de implementación debe conservar la conformidad del perfil.

Los tamaños y tiempos observados son del experimento, no compromisos sobre la biblioteca generada. No se probaron Firefox, Safari, móviles, todos los bundlers o funcionamiento offline. Node ejecutó TypeScript mediante eliminación de tipos; no se ejecutó tsc.

El fixture del host no es un verificador exhaustivo de declaraciones arbitrarias. No se implementaron cargador RDF, generador TypeScript, HTTP, PATCH, SQLite, el catálogo completo de referencias/cardinalidad ni satisfacibilidad exhaustiva. La aceptación de la implementación deberá cubrirlos conforme a sus contratos; esta decisión resuelve la viabilidad y el perfil de expresiones.
