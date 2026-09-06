# Evaluar un perfil portable de CEL para la capa de contrato

**Prototipo desechable, evidencia parcial — decisión abierta.** Contexto: [Evaluar un perfil portable de CEL para la capa de contrato](https://github.com/TalbyAI/talby-domain/issues/3). Perfil normativo: [Formas léxicas y catálogo inicial de funciones](https://github.com/TalbyAI/talby-domain/blob/bde49ea45d7b79147c0ba7ed35c80d469a1f5302/docs/research/formas-lexicas.md).

## Reproducir

Entrar primero en esta carpeta. Todo el código, dependencias, configuración, cachés Go y resultados propios del prototipo quedan aquí. Eliminarla no requiere cambios en el resto del repositorio.

```powershell
Set-Location prototypes/cel-portable
npm ci
./run.ps1
```

Probado en Windows, Node 24.14.1 y Go 1.26.4. Dependencias fijadas: `@marcbachmann/cel-js` 8.0.0, `re2-wasm` 1.0.2 y cel-go 0.26.1; consultar los lockfiles. Node ejecuta TypeScript mediante eliminación de tipos: esta prueba no incluye una compilación con tsc.

Abrir `report.html` con doble clic para recorrer la evidencia registrada. `cases.mjs` materializa `cases.json`; cada host consume los mismos casos y comprueba sus resultados contra un oráculo explícito. `report.mjs` también comprueba igualdad entre hosts. Una diferencia termina el comando con error. Los resultados intermedios se escriben en `results/`.

## Evidencia obtenida

104 casos pasan en ambos hosts: canonicalización decimal exacta e idempotencia, comparación superior a la precisión de number, precisión/escala de valor, calendario gregoriano, Periodo, instantes UTC y desplazamientos, rechazo de pérdida de precisión, trim fijo, límites de 4096/4097 cifras, matriz required/nullable, rechazos de firmas incompatibles y coincidencia completa de patrones de prueba.

El verificador distingue Decimal, CivilDate e Instant de string y entre sí. La declaración `compareDecimal("1", "2")` falla antes de evaluar. `false` de una aserción y error de evaluación se mantienen como resultados diferentes. Los nombres de estado y de funciones de este prototipo no fijan el catálogo público de errores ni las firmas definitivas.

Las reglas de presencia usan una variable `map<string,dyn>` declarada. La versión probada de cel-js rechaza `has({}.x)`; cel-go además rechaza comparar un valor estáticamente string con null. Por ello no se infiere el esquema de presencia desde literales: el entorno declara el mapa. No se debilitan los tipos de decimal/fecha a dyn.

## Nativo frente a host

| Responsabilidad | Prueba |
| --- | --- |
| Parseo de CEL, firmas, booleanos, has sobre mapa declarado | Bibliotecas CEL |
| Decimal, fecha civil e instante del perfil | Tipos y funciones del host, implementados independientemente |
| Comparación decimal | BigInt en TypeScript, big.Rat en Go; nunca number/double |
| Canonicalización de instantes | Validación léxica y de calendario del host antes de Date/time; fracción exacta y rango UTC explícitos |
| Patrones | Función fullMatch del host; RE2-WASM en TypeScript y regexp en Go; anclaje absoluto `\A(?:...)\z` |

No se utiliza el matches predeterminado de CEL. El patrón con salto final se rechaza; el literal astral se compara por carácter; `(a+)+` sobre 30 000 letras seguidas de `!` termina y devuelve false. El caso adversario no es una demostración experimental de complejidad. La garantía algorítmica depende de los motores elegidos; no se midió rendimiento.

## Frontera pendiente

- **Restricción del cliente:** confirmar si admite cargar WASM en navegador. La prueba ejecutada es Node, no un navegador. No se afirma compatibilidad de empaquetado, CSP ni tamaño aceptable.
- **Patrones:** falta implementar y comprobar el parser que rechaza toda sintaxis fuera del perfil, y acordar/ejecutar límites de longitud, profundidad y expansión comunes. fullMatch acepta ahora la sintaxis del motor: solo sirve para los patrones de la muestra, no valida el perfil aprobado. RE2 y regexp pueden introducir límites adicionales que aún deben contrastarse.
- **Conformidad restante:** identificadores y sus restricciones, texto Unicode inválido, tipos JSON en la frontera, acumulación de restricciones, enumeraciones, campos desconocidos y diagnósticos por rutas. Dos inclusiones de Periodo se representan aquí como dos aserciones; no se ha implementado un cargador de contratos ni PATCH.
- **Expresiones:** falta cerrar y verificar una lista de sintaxis/funciones permitidas y cotas comunes de recursos. Estos programas no deben aceptar expresiones o patrones de fuentes no confiables.

La evidencia demuestra mecanismos concretos de extensión y coincidencia en estos casos. Todavía no basta para adoptar ni descartar CEL para la primera entrega. Go es un motor de contraste, no una elección del stack de producción. El ticket permanece abierto para la revisión humana y las pruebas pendientes.

## Fuentes primarias

- [CEL: definición del lenguaje](https://github.com/cel-expr/cel-spec/blob/master/doc/langdef.md): tipos y extensiones.
- [cel-js](https://github.com/marcbachmann/cel-js): registro de tipos, funciones y entorno de comprobación.
- [cel-go](https://github.com/cel-expr/cel-go): compilación y extensiones del host.
- [RE2-WASM](https://github.com/google/re2-wasm): bindings de RE2 para evitar backtracking exponencial.
- [Go regexp](https://pkg.go.dev/regexp): garantía de tiempo lineal en el tamaño de entrada para sus expresiones regulares.
