# Diseño: inspector del modelo efectivo y CRUD derivado

## Pregunta

¿Qué forma inspeccionable produce la carga y verificación de fuentes, cómo distingue declaraciones de opciones por defecto y cómo materializa CRUD, mensajes de cambios parciales, permisos y rutas derivadas?

## Decisión

Crear un prototipo lógico autocontenido que priorice la inspección del modelo efectivo. La persona podrá seguir el flujo `source → verify → materialize → inspect` y ver, para cada dato, si procede de la fuente, del perfil de prototipo o de una derivación.

El prototipo no ejecutará HTTP, SQLite ni generación real de TypeScript. Su objetivo es validar la forma del modelo y de sus contratos derivados antes de diseñar esas implementaciones.

## Forma del artefacto

El prototipo vivirá en `prototypes/effective-contract-inspector/` y tendrá:

- una página HTML autocontenida, abrible directamente sin instalación;
- un README mínimo con el modo de ejecución;
- un `.gitignore` propio, sin dependencias ni artefactos generados.

La página será una envoltura fina sobre un módulo puro dentro de su único `script`. El módulo no conocerá el DOM y expondrá transformaciones sobre datos planos:

`source → verify(source) → materialize(source, profile) → inspect(effectiveModel)`.

## Modelo visible

El estado de la página mostrará siempre:

1. la fuente cargada;
2. la etapa alcanzada (`cargada`, `verificada` o `materializada`);
3. los diagnósticos de verificación;
4. el modelo efectivo, si la verificación permite materializarlo.

Cada declaración, default y elemento derivado incluirá su origen visible: `declarado`, `default` o `derivado`. Para cada operación derivada se mostrarán la ruta pública, los permisos, el contrato de entrada/salida y las reglas aplicables.

El ejemplo será un módulo `gestion`, una feature `proyectos` y una entidad `Proyecto`, con identificador, una agrupación anidada `Periodo` y un importe decimal. El contenido será pequeño y representativo; no intentará cubrir todo el lenguaje.

## Interacción

La exploración libre ofrecerá acciones para:

- cargar la fuente mínima;
- verificarla;
- materializar el modelo efectivo;
- cargar una variante con declaraciones explícitas;
- cargar una variante inválida;
- reiniciar.

Cada acción actualizará el estado completo y señalará qué cambió.

Habrá tres pestañas guiadas. Cada una reinicia a un estado conocido y avanza con botones reales:

1. **CRUD explícitamente habilitado**: carga una entidad que declara `crud: true`, verifica y materializa las cinco operaciones: crear, obtener, listar, actualizar parcialmente y eliminar.
2. **Declaración explícita**: muestra un override de ruta y permisos declarados; esos valores sustituyen los defaults correspondientes y el inspector conserva la procedencia.
3. **Verificación bloqueante**: carga una referencia inexistente o una contradicción, muestra el diagnóstico y deja claro que no se produce un modelo efectivo parcial.

## Evidencia de la decisión

El prototipo será satisfactorio si permite observar sin leer código que:

- CRUD explícitamente habilitado deriva exactamente las cinco operaciones acordadas;
- un PATCH conserva los campos ausentes, sustituye completa una agrupación presente y valida el estado resultante;
- las reglas de una inclusión anidada permanecen visibles en su contexto;
- un override explícito gana al default;
- los permisos y rutas muestran si son declarados o derivados;
- una referencia inexistente o contradicción bloquea la materialización;
- ningún default se confunde con comportamiento declarado.

## Límites

No se incluirán persistencia, red, servidor, dependencias, generación de cliente, comparación de fuentes ni pruebas separadas. El HTML debe seguir siendo un activo desechable y aislado del código de producción.
