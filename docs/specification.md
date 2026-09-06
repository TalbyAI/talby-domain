# Especificación de servicios empresariales

Estado: requisitos aprobados por el usuario tras revisar el conjunto; entrevista cerrada. Las decisiones recogidas delimitan la primera entrega y la evolución prevista; todavía no constituyen una ontología ejecutable ni una implementación.

## Resultado esperado de la primera entrega

Definir un contrato público en RDF/Turtle, comprobarlo mediante SHACL y verificación semántica, generar una biblioteca TypeScript y ejecutar un mock HTTP/JSON con SQLite. El caso de aceptación es gestión de proyectos. Se incluyen normalización y validación equivalentes entre cliente y motor, permisos de prueba, mocking declarativo y comparación de compatibilidad entre fuentes.

Semántica, visualización y mocking se mantienen en fuentes separadas con ontologías propias. La primera entrega define el formato extensible; construir el editor visual completo queda para después. Para sus aserciones se adopta el [perfil acotado de CEL con tipos del host y RE2JS para patrones](adr/0007-perfil-cel-acotado.md), respaldado por la evaluación de portabilidad.

El diseño detallado posterior concretará shapes, propiedades RDF, firmas de funciones, contratos HTTP y pruebas ejecutables. Las decisiones sobre workflows durables, persistencia avanzada, migraciones y asentamiento se conservan como dirección futura, fuera de la implementación inicial.

## Intención expresada

Describir el funcionamiento de un bounded context de DDD mediante un DSL, ejecutarlo como prototipo en un entorno de pruebas y evolucionarlo fácilmente. El motor dinámico debe permitir posponer el asentamiento hasta que exista una necesidad de rendimiento y escalabilidad muy elevados.

El «95 %» expresa una aspiración de cobertura amplia, no un umbral numérico. El caso central son servicios que reciben comandos o eventos externos, aplican reglas sobre su modelo de datos y registran acciones asociadas a esas operaciones.

## Alcance solicitado

- Modelo de datos: value types, validación, normalización, ontología, comandos, read models, eventos de dominio y de integración, queries, permisos y evolución con compatibilidad explícita.
- Procesos de negocio: workflows, suscripciones a eventos, schedules e intervención humana.
- APIs: operaciones públicas y mapeos a REST, gRPC, WebSockets, GraphQL y otros protocolos.
- Ejecución dinámica: persistencia seleccionable, con al menos CRUD y event sourcing, sin excluir otras modalidades; CQRS con alcance pendiente de precisar.
- Asentamiento: implementación independiente del DSL en un stack concreto.

## Evidencia existente

`samples/projects.md` explora entidades y propiedades con notación Turtle y vocabulario `tdpo`, incluidas validación y normalización. Turtle se ha elegido como serialización; el vocabulario concreto del ejemplo no constituye todavía una ontología aprobada.

## Autoría y ontologías

Desarrolladores, analistas de negocio y product managers mantienen conjuntamente las especificaciones. Una herramienta visual debe asistir en su visualización, comprensión, exploración y creación.

Se adoptan RDF como modelo formal, Turtle como serialización común de las fuentes y SHACL para comprobar conformidad. Se empieza por vocabulario y conformidad modular. Cualquier deducción que afecte a la ejecución debe ser explícita y visible en el modelo efectivo. Las shapes concretas siguen pendientes.

La edición visual y textual operan sobre un único modelo semántico compartido, con representación textual versionable. El editor visual debe preservar los elementos que no sepa representar. La información visual se guarda en una fuente separada, con una ontología propia y el mismo formato RDF que la semántica. Editar información semántica modifica su fuente; cambiar ubicación, colores u otros detalles visuales modifica la fuente visual. La disposición gráfica no determina el comportamiento.

La ejecución selecciona explícitamente los archivos semánticos y, opcionalmente, una fuente de mocking. Las referencias deben resolverse entre las fuentes y ontologías cargadas; encontrar una IRI no provoca descargas automáticas. Referencias inexistentes o declaraciones contradictorias impiden iniciar el mock.

Una tercera ontología extiende la capa de modelación para describir mocking de operaciones. Sus datos constituyen una fuente adicional opcional, seleccionable al ejecutar para simular los comandos que lo necesiten. Las tres ontologías describen aspectos distintos; sus fuentes concretas contienen los datos del servicio, su visualización y sus simulaciones.

Los escenarios iniciales se seleccionan por operación y condiciones sobre la entrada, y producen una respuesta o error declarado. Sin coincidencia se indica operación no simulada; varias coincidencias producen un error de ambigüedad. CRUD conserva su comportamiento derivado con SQLite. Los escenarios con estado quedan para una extensión posterior.

El vocabulario mínimo solicitado incluye tipos primitivos básicos, módulo, feature, entity, field, field group, validation rules y normalization rules. También deben cubrirse los conceptos ya acordados: comandos, eventos, modelos de lectura, queries, tipos de valor, referencias y colecciones. `Command` se define como especialización de `FieldGroup`.

## Tres capas de abstracción

Los nombres siguientes identifican las capas descritas por el usuario; no fijan palabras clave del DSL.

1. Capa de contrato: modelo de datos público, validación estructural y normalización desde la perspectiva del consumidor del servicio.
2. Capa de negocio: procesos de tratamiento de datos, respuesta a eventos y comportamiento desde la perspectiva del experto del dominio.
3. Capa técnica: capacidades y decisiones de implementación desde la perspectiva del arquitecto o technical leader.

Debe ser posible obtener un primer prototipo definiendo solo la primera capa, generar una biblioteca cliente y producir mocks para pruebas de integración o desarrollo de un front-end. El motor puede ofrecer una API de demostración que guarde datos en SQLite sin implementar todavía la lógica de negocio.

Se acepta un perfil de prototipo explícito, con operaciones básicas y acceso de pruebas definido. Su versionado, al igual que el resto del sistema de versiones, se aplaza hasta la versión 1.0 del producto. La herramienta debe mostrar qué comportamiento procede de defaults y qué reglas de negocio faltan.

La capa de negocio añade condiciones semánticas y la técnica implementa las garantías declaradas. Las contradicciones deben detectarse durante la declaración, verificación o ejecución, sin cambiar silenciosamente el comportamiento. SHACL comprueba la estructura de las especificaciones; la verificación comprueba referencias, tipos y funciones soportadas; la ejecución valida los datos normalizados.

## Composición del modelo público

Se describen campos con sus reglas de normalización y validación y vistas que agrupan campos para representar comandos, eventos, modelos de lectura y otros contratos. Los modelos de entrada admiten reglas adicionales que combinan varios campos. Los comandos pueden componerse de campos individuales y agrupaciones de campos. También pueden declararse comandos y eventos de integración.

`Command` es una especialización de `FieldGroup`: declara directamente campos y reglas, más permisos, configuración API y referencias a resultados y errores. Puede contener otras agrupaciones mediante campos anidados. No se exige una declaración de agrupación de entrada adicional. Los metadatos de permisos y API no forman parte de los datos enviados.

`Query` es una agrupación especializada de parámetros con permisos, configuración API y resultado asociado. `ReadModel` y los tipos de evento son agrupaciones especializadas con sus metadatos propios. Un evento describe una ocurrencia y sus datos, y no exige un resultado de operación como un comando o query.

Todo comando o modelo que utiliza un campo incorpora todas sus restricciones. Solo puede añadir restricciones que se combinan con las originales; nunca debilitarlas. Se distingue un modelo completo de un mensaje de cambios parciales: en este último, ausencia significa no modificar, los valores presentes conservan sus restricciones y el estado resultante cumple todas las reglas. Esto no convierte los campos originales en opcionales.

En la primera iteración las agrupaciones solo se incorporan anidadas, mediante un campo compuesto con nombre explícito. Se conserva la agrupación con sus reglas entre campos, aplicadas independientemente a cada inclusión. El aplanado queda fuera de esta iteración para simplificar la preservación de esas reglas. Si se incorpora más adelante, requerirá renombrados explícitos para resolver conflictos y conservará las referencias de las reglas dentro de cada inclusión.

En un mensaje de cambios parciales, una agrupación presente se sustituye completa y una ausente permanece intacta. La agrupación aportada conserva sus propias validaciones y debe cumplir las validaciones globales del comando que la contiene. No se admiten modificaciones parciales recursivas dentro de la agrupación en esta iteración.

Una entidad puede declarar que dispone de CRUD por defecto; en ese caso, sus operaciones quedan presentes sin describir los comandos uno a uno. Se derivan crear, obtener por identificador, listar con paginación, actualizar parcialmente y eliminar. El identificador debe estar declarado. Al actualizar, los campos ausentes permanecen intactos y se valida el estado resultante. Las operaciones derivadas deben poder inspeccionarse como contratos explícitos. Su interacción con vistas explícitas y el detalle de las respuestas y errores se concretarán en el diseño de los contratos derivados.

Los listados deben admitir tanto `offset + limit` como `continuationToken + limit`. El límite por defecto es 20 y el máximo 100, con orden estable por identificador. Cada listado declara las modalidades admitidas y una por defecto; los listados CRUD derivados admiten ambas. La petición selecciona una modalidad y se rechaza mezclar `offset` y token.

El continuation token es opaco y queda vinculado a la consulta, sus filtros y orden. Un token inválido produce un error explícito. El prototipo continúa desde la última posición sin garantizar una instantánea inmutable de los datos entre páginas. Una garantía de snapshot podrá incorporarse como capacidad técnica posterior. La codificación del token y el mecanismo concreto de selección de modalidad se concretarán en el contrato HTTP.

Las colecciones son listas ordenadas y se sustituyen completas al actualizar. Las referencias a entidades validan tipo y formato del identificador; comprobar la existencia del destino es una regla adicional de negocio.

El servicio se describe como un módulo sin padre; el módulo no es una feature. Una feature tiene como padre un módulo u otra feature. Una entidad pertenece a un módulo o a una feature. Se admiten varios niveles de anidación. El módulo constituye la frontera de aislamiento respecto a otros servicios; las features solo organizan y no crean fronteras transaccionales o de despliegue.

Los elementos declarados mantienen identificadores estables, separados de sus nombres y ubicación. El namespace organiza su representación en la API y en bibliotecas cliente. La jerarquía forma el namespace interno y la ruta pública de la API por defecto, salvo configuración explícita. Una reorganización puede cambiar rutas públicas aunque conserve la identidad de los elementos. Las referencias entre features se resuelven por identificador entre las fuentes cargadas.

Se distinguen tipos de valor, entidades con identidad, referencias tipadas y colecciones con cardinalidad. El mock almacena los valores incluidos y representa las referencias mediante identificadores, sin asumir cargas automáticas ni borrados en cascada. La identidad de una entidad almacenada y el identificador estable de su declaración son conceptos distintos.

El catálogo inicial incluye texto, booleano, entero, decimal exacto, fecha, instante temporal e identificador, además de enumeraciones y tipos de valor restringidos. No se impone UUID como formato de identificador.

El primer perfil HTTP/JSON y TypeScript utiliza estas representaciones:

| Tipo | Representación |
| --- | --- |
| Texto, identificador, enumeración | Cadena. |
| Booleano | Booleano. |
| Entero | Número entero entre −9 007 199 254 740 991 y +9 007 199 254 740 991. |
| Decimal exacto | Cadena decimal, sin conversión implícita a `number`. |
| Fecha | Cadena `YYYY-MM-DD`. |
| Instante | Cadena UTC con `Z` y precisión de milisegundos. |

Los decimales se representan como cadenas sin exponente, con límites de precisión y escala declarables y sin redondeo implícito. Los instantes se normalizan a UTC y se rechaza precisión superior a milisegundos cuando no pueda conservarse exactamente. Las fechas deben representar días válidos. Las formas léxicas exactas se concretarán en los contratos de las funciones del prototipo.

El modelo de cada entidad configura el prefijo de su identificador. La regla de formato admite prefijos y sufijos y permite únicamente caracteres ASCII `A-Z`, `a-z`, `0-9`, `-` y `_`, rechazando espacios y caracteres de control. La longitud es configurable por entidad, con un default de 1–128 caracteres incluyendo prefijo y sufijo. La comparación distingue mayúsculas; no se modifican automáticamente salvo normalización explícita. Los defaults se resuelven al declarar el tipo de identificador; sus usos conservan las restricciones resultantes sin debilitarlas.

La capa técnica elige cómo generar identificadores y debe cumplir todas las reglas del modelo. ULID con prefijo es una opción preferida para el prototipo, no un formato obligatorio del contrato. El prefijo es explícito y estable, independiente del namespace.

La primera capa define únicamente el modelo público. En negocio se puede ampliar con campos y reglas privados. Se asume el modelo privado como extensión del público y se declaran mappings donde difieren. Los datos privados no deben quedar expuestos por esa extensión.

## Normalización y validación

La ontología contiene un conjunto de reglas de normalización y validación. Primero se normaliza y después se valida: por ejemplo, aplicar `trim` y luego comprobar longitud máxima y una expresión regular.

El catálogo mínimo incluye obligatoriedad, admisión de `null`, longitud, rango, patrón, pertenencia a enumeración, cardinalidad y expresiones entre campos. `trim` es el primer normalizador. El catálogo crecerá según casos reales.

Los normalizadores se ejecutan en orden declarado sobre valores compatibles. Una incompatibilidad produce un error estructurado y no una conversión implícita. Después se validan los valores normalizados y las reglas entre campos. La obligatoriedad y la admisión de `null` son propiedades distintas; ausencia y `null` no se confunden.

En payloads JSON de entrada se rechazan campos desconocidos. El cliente tolera propiedades adicionales en las respuestas y valida los campos que conoce. El mock debe comprobar que sus respuestas cumplen el contrato declarado. Esta política de payloads no decide cómo se preservan vocabularios de extensión en los documentos RDF.

Debe existir un lenguaje de expresiones de escritura sencilla. El catálogo de reglas crecerá según las necesidades de expresividad. Para la primera entrega se adopta el [perfil CEL acotado](adr/0007-perfil-cel-acotado.md): tipos y comparadores explícitos del host para decimal exacto, fecha e instante, y RE2JS para patrones en TypeScript. Decimal no se convierte a `double`; los tipos opacos se comparan mediante sus comparadores, también para igualdad. El verificador rechaza funciones, tipos y sintaxis fuera del perfil antes de ejecutar. Sus límites operativos son explícitos e iguales en cliente y motor. La evaluación no decide el stack del motor ni adopta CEL para futuras capas o entregas.

El pipeline completo de normalización debe ser determinista e idempotente: `N(N(x)) = N(x)`. No depende del reloj, azar ni consultas externas. Los casos compartidos deben comprobar esta propiedad del pipeline completo, además de la equivalencia entre runtimes.

Las funciones básicas tendrán semántica especificada e implementación en los runtimes. Las reglas compuestas se expresarán sobre esas funciones. Una función desconocida debe detectarse durante la verificación, nunca ignorarse. SHACL comprueba la declaración; el ejecutor aplica el comportamiento definido.

## Permisos y biblioteca cliente

La primera entrega declara permisos nombrados por comando o query y permite asignarlos a actores de prueba para evaluar el acceso en el mock. Se deniega por defecto y se exige disponer de todos los permisos enumerados. El acceso anónimo requiere declaración explícita. CRUD deriva permisos por operación; el perfil de demostración proporciona un actor de prueba con ellos asignados y muestra claramente esas concesiones. Las políticas dependientes del estado del negocio quedan para la segunda capa. El mecanismo concreto de selección del actor queda para el diseño del ejecutor.

La biblioteca TypeScript incluye tipos, llamadas HTTP y funciones explícitas de normalización y validación con las mismas reglas del motor. El servidor sigue verificando cada entrada. Casos compartidos deben comprobar la equivalencia entre cliente y motor y la idempotencia de la normalización.

## Errores

Motor, mock y biblioteca cliente comparten un contrato de errores con código estable, mensaje y lista de incidencias. Cada incidencia de validación identifica la regla y las rutas de los campos afectados; una regla entre campos puede señalar varios. Se distinguen categorías de validación, errores de negocio declarados y fallos técnicos dentro del mismo contrato. Quedan pendientes el mapeo HTTP y la sintaxis exacta de las rutas.

## Convenciones HTTP del prototipo

Las rutas se derivan del módulo, features y nombre declarado, con override explícito. CRUD utiliza `POST` para crear, `GET` para obtener o listar, `PATCH` para actualizar parcialmente y `DELETE` para eliminar. Comandos y queries personalizados utilizan `POST` bajo `/commands/{nombre}` y `/queries/{nombre}`, respectivamente, dentro de su ruta de módulo y features.

Los resultados son el JSON del modelo declarado, sin envoltorio adicional salvo listados y errores. Los códigos de estado concretos y los nombres de propiedades del envoltorio se definirán en los contratos HTTP durante el diseño detallado.

## Workflows y extensiones

El workflow y las actividades que interactúan con el modelo del servicio se declaran en el DSL. Las actividades declarativas tienen una frontera transaccional explícita: sus cambios se confirman juntos o ninguno. Una operación que atraviesa fronteras se expresa como varios pasos. Debe comprobarse que la modalidad de persistencia cumple la frontera declarada; la forma de definir esa frontera sigue pendiente.

Las actividades en código se reservan para interacciones con sistemas externos, como cobros o envío de correos. Reciben entradas claras y definidas, devuelven resultados o errores y declaran sus efectos externos. No acceden directamente al estado del servicio principal, que conserva la autoridad sobre sus datos.

El motor interpreta la declaración e interactúa con servicios simples que ejecutan esas actividades externas. El motor de workflows debe ser durable y resiliente, tomando Temporal como referencia de comportamiento, sin decidir todavía una dependencia de ese producto. Tendrá reintentos automáticos y configuración declarativa del comportamiento de cada paso. Siguen pendientes el transporte, las políticas concretas de reintento, la gestión de resultados externos inciertos y la compensación.

La interacción declarativa con otros servicios descritos mediante DSL está prevista, pero no es un objetivo principal de la primera iteración.

Referencia contrastada: Temporal documenta [reintentos de actividades configurables](https://docs.temporal.io/encyclopedia/retry-policies), pero la [idempotencia de los efectos externos](https://temporal.io/blog/idempotency-and-durable-execution) requiere tratamiento específico. Por tanto, la petición de durabilidad y reintentos no resuelve todavía la política del DSL ante un cobro confirmado por el proveedor cuya respuesta se pierde. Esta decisión se reserva para la entrega de workflows.

## Persistencia y evolución del prototipo

La selección de persistencia podría ser una anotación técnica. Se desea comenzar con CRUD para comprobar la superficie del servicio y posteriormente especificar event sourcing. Se acepta que algunos cambios técnicos exijan reiniciar el estado persistido. Las herramientas de migración entre variantes de persistencia quedan para más adelante; no se promete conservación automática de datos al cambiar de modalidad.

La generación final debe atender a la modalidad declarada en el DSL. Quedan pendientes la expresión de las fronteras transaccionales, la concurrencia, las proyecciones y las garantías observables entre modalidades.

## Asentamiento y trazabilidad

Una herramienta generará código optimizado para un stack concreto, capaz de ejecutar SQL y sin dependencia del motor dinámico original. Puede depender de bibliotecas de runtime creadas para optimizar este tipo de aplicaciones.

El asentamiento es unidireccional en el alcance actual. El código generado debe incluir suficiente trazabilidad para identificar y explicar su origen en la especificación.

Se pretende facilitar futuros diffs y actualizaciones con mayor confianza, y potencialmente sincronización en cualquiera de las dos direcciones. Esa sincronización futura no es una capacidad exigida en esta versión.

## Compatibilidad del contrato público

La primera entrega mantiene el informe de compatibilidad entre una fuente anterior y otra nueva, sin exigir versiones declaradas ni implementar gestión de versiones. Comparará entradas aceptadas, salidas y rutas, clasificando los cambios como compatibles, incompatibles o pendientes de revisión cuando no pueda determinarlo. Se mantiene separado de las migraciones de persistencia.

La declaración del autor no oculta incompatibilidades detectadas. Conservar el identificador de una declaración permite reconocer movimientos o renombrados, pero no convierte en compatible un cambio de ruta o contrato. Quedan pendientes las reglas concretas de comparación y el tratamiento de los cambios de normalización.

El diseño futuro prevé versiones explícitas del módulo, ontologías, funciones y perfil de defaults, así como la selección de fuentes cargadas; las fuentes visuales y de mocking indicarán a qué versión semántica corresponden. Implementar este sistema de versionado no es necesario antes de la versión 1.0 del producto. La selección de fuentes semánticas y de mocking sigue siendo necesaria para ejecutar el prototipo actual.

## Primera entrega acordada

Definir correctamente el DSL de la capa pública para alcanzar un primer objetivo útil: contrato público → normalización y validación → biblioteca cliente generada → mock con SQLite, usando un servicio de ejemplo.

La visión global conserva las tres capas, workflows, actividades externas, modalidades de persistencia, editor visual y asentamiento. Su implementación no es requisito de esta primera entrega. El trabajo actual consiste en definir la especificación.

El primer transporte será HTTP con JSON, la biblioteca cliente se generará para TypeScript y el mock persistirá en SQLite. Los contratos permanecen independientes del transporte. Se usa Turtle para las fuentes RDF. El perfil CEL queda fijado en el ADR correspondiente; siguen pendientes las shapes concretas y los detalles de los contratos de transporte y tipos.

### Casos de aceptación derivados de los acuerdos

Estos casos describen comprobaciones futuras, no pruebas ya implementadas o ejecutadas.

El servicio de ejemplo será gestión de proyectos, partiendo del contexto de `samples/projects.md`, que se conserva como muestra original. Incluirá clientes y proyectos, una referencia de proyecto a cliente, una agrupación `Periodo` con `fin >= inicio`, operaciones CRUD, un comando `AprobarProyecto` simulado, un importe decimal y un evento declarado para comprobar su contrato. No requiere implementar workflows de aprobación.

| Caso | Resultado requerido |
| --- | --- |
| Campo con `trim` y longitud mínima uno recibe espacios | Se normaliza a vacío y se rechaza con incidencia de validación. |
| Normalizar un valor ya normalizado | Se conserva el mismo resultado; cliente y motor coinciden. |
| Un comando añade una restricción a un campo reutilizado | Se aplican tanto la restricción original como la añadida. |
| Actualización omite una agrupación o la aporta completa | La omitida se conserva; la aportada se sustituye y cumple reglas de agrupación y comando. |
| Dos inclusiones anidadas de la misma agrupación | Cada una conserva y aplica sus reglas en su propio contexto. |
| Identificador contiene espacio, control o un carácter fuera del alfabeto permitido | Se rechaza; el generador técnico debe producir valores conformes al modelo. |
| Mover un elemento entre features | Conserva su identificador de declaración; el informe detecta el cambio de ruta derivada. |
| Una operación simulada tiene cero, uno o varios escenarios coincidentes | Se informa no simulada, se obtiene respuesta/error o se informa ambigüedad, respectivamente. |
| Función declarada no soportada por el runtime | La verificación detecta el problema; la función no se ignora. |
| Comparar dos fuentes sin versión declarada | Se genera un informe de compatibilidad sin exigir gestión de versiones. |
| Cliente recibe una propiedad adicional en la respuesta | Tolera la propiedad adicional y valida los campos conocidos. |
| Comando recibe un campo JSON no declarado | Se rechaza con error estructurado. |
| Actor carece de uno de los permisos exigidos | Se deniega el acceso aunque posea los demás. |
| Demo ejecuta CRUD derivado | El actor de prueba dispone de concesiones visibles por operación. |
| Importe decimal recorre cliente, HTTP, mock y SQLite | Conserva su valor exacto sin pasar implícitamente por `number`. |
| CEL evalúa reglas de `Periodo` e importe decimal | Cliente y motor producen resultados equivalentes bajo el perfil adoptado y sus comparadores tipados; se rechaza sintaxis no admitida. |
| Un patrón CEL recibe una entrada con salto de línea final | La coincidencia completa solo lo acepta si el patrón incluye explícitamente ese salto. |
| Una fuente CEL, su AST, un patrón, sus repeticiones o su entrada exceden los límites del perfil | Cliente y motor rechazan la operación explícitamente, sin truncamiento ni cambios silenciosos. |
| Listar proyectos mediante offset y mediante continuation token | Ambas modalidades están disponibles y respetan los límites declarados. |
| Una petición mezcla offset y continuation token | Se rechaza con error explícito. |
| Un token no corresponde a la consulta, filtros u orden de la petición | Se rechaza; no se reinicia silenciosamente el listado. |
| Selección de fuentes contiene una referencia semántica inexistente | La verificación impide iniciar el mock sin intentar descargar la IRI. |
| Un instante requeriría perder precisión al expresarlo en milisegundos | Se rechaza la pérdida de precisión; no se redondea implícitamente. |

## Árbol de decisiones

Primera ronda resuelta: cobertura cualitativa; autoría conjunta; extensiones por actividad; persistencia seleccionable; asentamiento unidireccional con bibliotecas de runtime y trazabilidad.

Segunda ronda resuelta: contrato público con validación y normalización; clientes y mocks desde la primera capa; demo con SQLite; perfil de prototipo explícito; refinamiento sin contradicciones silenciosas; ontologías para vocabulario y conformidad modular; actividades declarativas internas y actividades externas en código; reinicio permitido al cambiar persistencia y migraciones diferidas; modelo semántico compartido por texto y editor visual. El versionado del perfil se aplaza en la octava ronda.

Tercera ronda resuelta: campos reutilizables agrupados en vistas y contratos; reglas entre campos de entrada; CRUD habilitado por entidad; jerarquía módulo/features/entidades; modelo privado como extensión con mappings; normalización previa a validación; fronteras transaccionales explícitas; workflows durables con reintentos y configuración por paso; primera entrega centrada en contrato, cliente y mock con SQLite.

Cuarta ronda resuelta: restricciones acumulativas sin debilitamiento; módulo sin padre y distinto de feature; entidades directamente en módulo o feature; jerarquía como namespace y ruta API por defecto; CRUD con actualización parcial y validación del resultado; lenguaje sencillo de expresiones y catálogo ampliable; normalizadores ordenados sin conversiones implícitas y distinción de ausencia y `null`. La composición se acota en la quinta ronda.

Quinta ronda resuelta: mensajes de cambios parciales distintos de modelos completos; únicamente composición anidada en la primera iteración; reglas preservadas por inclusión; identificadores estables independientes del namespace; tipos de valor, entidades, referencias y colecciones diferenciados; informe de compatibilidad desde la primera entrega.

Sexta ronda resuelta: sustitución completa de agrupaciones presentes con validación global del comando; RDF y SHACL; ontologías y fuentes distintas para semántica, visualización y mocking, con un formato compartido; vocabulario mínimo declarado; HTTP/JSON, cliente TypeScript y SQLite; fuente de mocking opcional seleccionable al ejecutar. La respuesta sobre vocabulario no fija todavía la lista concreta de primitivos.

Séptima ronda: se fijan Turtle, el catálogo básico con identificador no limitado a UUID, la semántica explícita e implementación de funciones y los mocks seleccionados por operación y condiciones con respuesta/error, ausencia y ambigüedad explícitas. Se prefiere ULID con prefijo por entidad como formato posible.

Octava ronda resuelta: `Command` especializa `FieldGroup`; identificadores con prefijo/sufijo, alfabeto y longitud definidos por reglas del modelo y generación técnica; permisos nombrados y actores de prueba; cliente con normalización y validación equivalente al motor; versionado aplazado hasta la versión 1.0 del producto.

Novena ronda resuelta: identificadores ASCII con longitud configurable y default 1–128, comparación sensible a mayúsculas; compatibilidad entre fuentes sin versionado; pipeline de normalización determinista e idempotente; CEL solo como prototipo de evaluación; contrato común de errores con incidencias por regla y campos.

Décima ronda resuelta: representaciones iniciales de tipos; rechazo de campos JSON desconocidos en entradas y tolerancia del cliente en salidas; autorización por defecto denegada con todos los permisos requeridos y actor demo explícito; queries, read models y eventos como agrupaciones especializadas; gestión de proyectos como ejemplo de aceptación.

Undécima ronda resuelta: convenciones HTTP y resultados sin envoltorio adicional salvo listados/errores; paginación por offset o continuation token con limit; listas ordenadas y sustitución completa; existencia de referencias como regla de negocio; carga explícita de fuentes sin descargas por IRI; rechazo de pérdida de precisión; catálogo mínimo y fases de validación. La aceptación de «para el resto» se ha aplicado a las demás recomendaciones de Q55–Q59.

Duodécima ronda resuelta: modalidades declaradas por listado con un default, CRUD con ambas modalidades, elección por petición sin mezclar offset y token, token opaco vinculado a consulta/filtros/orden y error explícito ante token inválido. El prototipo no promete un snapshot entre páginas.

La entrevista de requisitos queda cerrada con la aprobación del conjunto por el usuario. La siguiente etapa es el diseño detallado de la primera entrega: shapes, firmas de funciones, nombres de propiedades, contratos HTTP y casos ejecutables. Estos artefactos todavía no están implementados ni validados.

La investigación factual sobre representación, conformidad y expresiones está recogida a continuación. RDF, SHACL y Turtle están elegidos. Tras la evaluación del prototipo se aprueba el perfil CEL de la primera entrega recogido en el ADR; las rondas anteriores conservan el estado histórico de la entrevista.

Trabajo de diseño detallado: incorporar el perfil CEL evaluado; formas léxicas y funciones de tipos; reglas automatizables del informe de compatibilidad; contratos HTTP y errores; materialización de las modalidades de paginación; ejemplo Turtle completo y pruebas de aceptación ejecutables.

Ramas reservadas para entregas posteriores: concurrencia y persistencia avanzada; resultados externos inciertos; procesos duraderos, compensaciones e intervención humana; ejecución de proyecciones y queries complejas; editor visual; operación; conformidad entre motor e implementación asentada; continuidad durante el asentamiento.

## Referencias técnicas y opciones pendientes

- RDF ofrece el modelo de grafo y Turtle la sintaxis elegida para las fuentes. [W3C Turtle](https://www.w3.org/TR/turtle/).
- SHACL, ya elegido, permite validar grafos mediante shapes. SHACL 1.0 exige que los grafos permanezcan inmutables durante la validación; inferimos que el pipeline que transforma datos mediante normalizadores necesita semántica adicional. Tampoco define el ejecutor de escenarios mock. [W3C SHACL](https://www.w3.org/TR/shacl/#validation).
- Las IRIs permiten referenciar los mismos elementos desde distintas fuentes. RDF no define la carga automática de documentos por referenciarlos; habrá que especificar qué fuentes se cargan y validan juntas. [W3C RDF Concepts](https://www.w3.org/TR/rdf11-concepts/#referents).
- CEL permite expresiones comprobables contra un entorno de tipos y funciones; no define el DSL completo. El perfil adoptado fija las extensiones y los límites necesarios para la primera entrega, con evidencia compartida entre hosts. [Descripción de CEL](https://cel.dev/overview/cel-overview), [definición del lenguaje](https://github.com/cel-expr/cel-spec/blob/master/doc/langdef.md#extension-functions).
- CEL no tiene decimal exacto nativo: sus números estándar son `int`, `uint` y `double`. El perfil adoptado representa decimal exacto, fecha e instante mediante tipos y funciones explícitos del host, conforme al ADR. [Tipos numéricos](https://github.com/cel-expr/cel-spec/blob/master/doc/langdef.md#numeric-values), [tipos abstractos](https://github.com/cel-expr/cel-spec/blob/master/doc/langdef.md#abstract-types).
- ULID codifica 128 bits en 26 caracteres y admite lectura sin distinción de mayúsculas. Validarlo requiere comprobar también su rango, no solo longitud y alfabeto. Los prefijos por entidad y la forma textual normalizada serían convenciones del proyecto adicionales al formato ULID. [Especificación ULID](https://github.com/ulid/spec#specification), [desbordamiento](https://github.com/ulid/spec#overflow-errors-when-parsing-base32-strings).
- Para implementaciones numéricas binary64, JSON identifica como interoperable el rango entero ±9 007 199 254 740 991 y permite límites de precisión por implementación. El perfil elegido restringe el entero inicial a ese rango y representa decimales exactos como cadenas. [RFC 8259, sección 6](https://www.rfc-editor.org/rfc/rfc8259#section-6).
- RFC 3339 define fecha completa `YYYY-MM-DD` e instantes con desplazamiento o `Z`, con fracción de segundo opcional. El perfil elegido utiliza salida UTC con `Z` y precisión de milisegundos. [RFC 3339, sección 5.6](https://www.rfc-editor.org/rfc/rfc3339#section-5.6).
