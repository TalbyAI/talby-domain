# Evaluar un perfil portable de CEL para la capa de contrato

**Prototipo desechable; propuesta pendiente de decisión humana.** [Ticket de decisión](https://github.com/TalbyAI/talby-domain/issues/3). [Perfil léxico aprobado](https://github.com/TalbyAI/talby-domain/blob/bde49ea45d7b79147c0ba7ed35c80d469a1f5302/docs/research/formas-lexicas.md).

## Propuesta

219 casos coinciden con sus resultados esperados en TypeScript/Node, cel-go y Chrome. Se propone adoptar **CEL acotado, tipos/comparadores del host y RE2JS para patrones** en la primera entrega. La equivalencia comprobada pertenece a este perfil, no a CEL completo ni a cualquier implementación del lenguaje.

El usuario permitió evaluar WASM como candidato, sujeto a integración, tamaño y comportamiento en navegador. Las pruebas posteriores favorecen RE2JS: funciona sin WASM ni evaluación dinámica de JavaScript. No se reduce el perfil para usar RegExp nativo ni se necesita mantener un motor de regex propio.

Go es un contraste independiente, no la elección del stack de producción. Esto tampoco adopta CEL definitivamente para futuras entregas o capas.

## Reproducción aislada

Entrar primero en esta carpeta. Sus dependencias, configuración, scripts, cachés Go y resultados quedan aquí; ninguna otra parte del repositorio depende de ella.

```powershell
Set-Location prototypes/cel-portable
npm ci
./run.ps1
```

Probado en Windows con Node 24.14.1 y Go 1.26.4. Versiones fijadas: cel-js 8.0.0, cel-go 0.26.1, re2js 2.8.6, re2-wasm 1.0.2 y esbuild 0.28.2. Node ejecuta TypeScript eliminando tipos; no se ejecutó tsc.

`cases.mjs` materializa `cases.json`. Cada host consume esos datos y comprueba resultados contra expectativas explícitas. `report.mjs` comprueba también igualdad entre hosts. Los fallos terminan el comando con error. `report.html` se abre con doble clic y muestra evidencia registrada.

Desde esta carpeta, para navegador:

```powershell
node build-browser.mjs
node serve.mjs
```

En otra terminal, también dentro de esta carpeta, usar Playwright CLI instalado:

```powershell
playwright-cli -s=cel-portable open --browser=chrome
playwright-cli -s=cel-portable run-code --filename=browser-check.js
```

Si se cambian los casos, conservar la nueva evidencia antes de regenerar el informe:

```powershell
$evidence = playwright-cli -s=cel-portable --raw run-code --filename=browser-check.js
$evidence | ConvertFrom-Json | ConvertTo-Json -Depth 20 | Set-Content browser-evidence.json -Encoding utf8
node report.mjs
```

El informe comprueba el hash SHA-256 de los casos contra la evidencia del navegador para no asociar una ejecución a otros vectores.

También se puede abrir `http://127.0.0.1:4178/no-wasm/index.html` directamente. La página ejecuta los casos en un Worker y muestra fallos, tiempo observado y navegador. El servidor solo escucha en loopback y sirve una lista fija de archivos. Detener con Ctrl+C.

Para reproducir el rechazo de WASM: `node build-browser.mjs wasm`, seguido de `playwright-cli -s=cel-portable run-code --filename=browser-wasm-check.js`. Esta prueba comprueba fallos esperados. `node build-browser.mjs` restaura la variante recomendada.

## Comparación de candidatos en navegador

| Candidato sin parches | Resultado | Tamaño observado |
| --- | --- | --- |
| CEL + RE2JS | 217 casos pasan con `script-src 'self'`, sin permisos para WASM/eval; ninguna petición externa o WASM | Worker: 449 483 bytes; gzip 98 131 bytes, aproximadamente 96 KiB |
| CEL + RE2-WASM | Con `wasm-unsafe-eval`, falla al cargar por `new Function`; con `unsafe-eval` en una prueba negativa, falla `WrappedRE2 is not a constructor` | Worker 69 635 bytes gzip y WASM 312 328 bytes gzip; unos 373 KiB combinados |

No se parcheó WASM ni se propone debilitar la CSP. Los fallos pertenecen a esa versión y empaquetado, no demuestran una limitación intrínseca de WebAssembly. Reparar/recompilar sus bindings sigue siendo posible; RE2JS ya resuelve los casos comprobados con menor integración.

`browser-evidence.json` conserva la ejecución en HeadlessChrome 152, Windows: 217 casos, cero fallos, cuatro peticiones al mismo origen. Los tiempos conservados son una medición local, no un benchmark o garantía. `browser-wasm-evidence.json` conserva los fallos del otro candidato. El tamaño incluye CEL, host, verificadores y fixture; excluye HTML, launcher y datos de prueba. No predice la biblioteca generada final.

No se probaron Firefox, Safari, móviles, todos los bundlers, CSP de extensiones ni funcionamiento offline.

## Responsabilidades

| Responsabilidad | Implementación probada |
| --- | --- |
| Parseo CEL, firmas, booleanos, presencia | Bibliotecas CEL bajo lista explícita de sintaxis y funciones |
| Decimal, fecha civil, instante del perfil | Tipos y funciones del host, independientes en TypeScript y Go |
| Comparación decimal | BigInt en TypeScript, big.Rat en Go; nunca number/double |
| Fecha e instante | Léxico/calendario antes de Date/time; canon UTC exacto y rango explícito |
| Normalización, validación estructural y acumulación | Host, antes de suministrar valores válidos a aserciones |
| Patrones | Parser del perfil en cada host, anclaje absoluto y RE2JS/Go regexp |

Decimal, CivilDate e Instant son diferentes de string y entre sí. `compareDecimal("1","2")` falla antes de evaluar. CEL no aporta nativamente las canonicalizaciones del contrato.

Orden: estructura/tipos y presencia; trim declarado; canonicalización intrínseca; restricciones acumulativas; aserciones cuyos campos sean válidos. Un campo inválido no alimenta reglas dependientes, pero no impide informar errores independientes. El host conserva rutas y distingue incumplimiento (`false`) de error de evaluación. Los códigos, mensajes y rutas definitivos pertenecen a su ticket.

`fields.ts`/`fields.go` son un fixture pequeño de modelo efectivo, no un verificador exhaustivo de declaraciones arbitrarias. No fijan RDF ni API pública. Periodo se contrasta mediante expresiones CEL y mediante agrupaciones anidadas del fixture. No se construyeron cargador RDF, generador TypeScript, HTTP, PATCH o SQLite.

## Perfil CEL propuesto

- Literales bool, null, string e int; campos de un entorno declarado; `has`; negación, conjunción/disyunción y comparaciones escalares compatibles. Las aserciones exigen resultado bool; las sondas de canon devuelven escalares para inspeccionarlos.
- Funciones explícitas del host para tipos, comparadores y patrones. Helpers como `canon` o `decimalScale` son instrumentación: no fijan nombres RDF ni firmas públicas.
- El modelo debe verificar rutas y declarar tipos efectivos. Los mapas dinámicos del fixture permiten representar presencia, pero por sí solos no detectan errores tipográficos en nombres de campos.
- Decimal/fecha/instante se comparan mediante sus comparadores, también para igualdad. Se rechaza igualdad directa entre esos tipos opacos: cel-go la admite, mientras que el candidato TypeScript la rechaza.
- Se excluyen aritmética general, double/uint, conversiones implícitas, matches/timestamp nativos, comprehensions, macros distintos de has, literales de colecciones, índices y condicionales. Colecciones, pertenencia y otras restricciones del catálogo siguen siendo responsabilidades del host.
- Funciones desconocidas, tipos incompatibles, sintaxis excluida y aserciones no booleanas fallan en verificación. Los patrones declarados deben compilarse al verificar el modelo; el prototipo invoca su parser dentro de fullMatch para probar los rechazos.

## Límites operativos propuestos

Se mantienen los techos aprobados de 4096 dígitos léxicos decimales y 4096 cifras de fracción temporal. Los siguientes son propuestas adicionales de recursos, pendientes de adopción con el perfil; deben aparecer en el modelo efectivo, sin truncamiento ni cambios silenciosos.

| Recurso | Límite |
| --- | --- |
| Fuente de patrón | 4096 valores escalares Unicode, incluidas anclas opcionales |
| Grupos anidados | 32 |
| Repetición contada individual | 0–1000, como el perfil aprobado |
| Producto de repeticiones contadas anidadas | 1000; evita un límite oculto de Go |
| Coste estructural estimado expandido del patrón | 8192 unidades |
| Entrada de una evaluación de patrón | 65 536 valores escalares Unicode |
| Fuente CEL | 65 536 valores escalares Unicode |
| AST CEL | 1024 nodos, profundidad 64 |
| Paréntesis/prefijos unarios anidados en la fuente CEL | 64; comprobados además del AST porque los parsers simplifican de forma distinta |

Coste de patrón: literal/clase = 1; alternancia = 1; grupo = interior + 1; ?, * y + suman 1; repetición finita multiplica por max(1,m); {n,} multiplica por n+1; concatenación suma. No son bytes ni instrucciones reales del motor, y no se promete latencia constante.

La coincidencia consume toda la cadena, incluido un salto final, por valores escalares. El parser rechaza la sintaxis excluida antes del motor. No basta con que una biblioteca acepte el patrón.

La ausencia de backtracking exponencial depende de los algoritmos RE2JS y Go regexp. Los casos adversarios verifican integración, no prueban por sí solos una cota asintótica. Presupuestos totales por petición, número de reglas, payload y cardinalidad siguen en el contrato técnico correspondiente: estos topes son por operación.

## Cobertura y alcance

Casos: decimal exacto, p/s de valor, calendario, offsets equivalentes, milisegundos exactos, años UTC extremos, límites 4096/4097, trim/idempotencia, required/nullable, Unicode astral/sustituto aislado, entero fuera de rango, booleano como cadena, identificadores 1/128/129 y prefijo/sufijo solapados, restricciones heredadas, enumeraciones incompatibles/duplicadas, campos desconocidos, errores independientes, Periodo anidado, gramática de patrones y topes de recursos.

No es certificación de todo contrato posible. No ejecuta el catálogo completo de referencias, cardinalidad, actualización parcial ni satisfacibilidad exhaustiva. Sus interfaces y aceptación pertenecen a la implementación posterior. Las referencias seguirán validando tipo/formato sin consultar existencia; el prototipo no introduce consultas.

La evidencia permite decidir viabilidad y perfil. La resolución y aceptación de límites se registrarán en el issue tras el intercambio humano; este documento no cierra el ticket por sí solo.

## Fuentes primarias

- [CEL](https://github.com/cel-expr/cel-spec/blob/master/doc/langdef.md), [cel-js](https://github.com/marcbachmann/cel-js), [cel-go](https://github.com/cel-expr/cel-go): entorno de tipos y extensiones.
- [RE2JS](https://github.com/le0pard/re2js), [RE2](https://github.com/google/re2), [Go regexp](https://pkg.go.dev/regexp): implementaciones y garantías algorítmicas. RE2 referencia RE2JS como port JavaScript.
- [RE2-WASM](https://github.com/google/re2-wasm): paquete evaluado; errores reproducidos localmente.
- [CSP script-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src): diferencia entre permisos de WASM y eval.
