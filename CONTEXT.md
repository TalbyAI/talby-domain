# Lenguaje de servicios empresariales

Vocabulario del proyecto para describir y ejecutar servicios y trasladarlos a un stack tecnológico concreto.

## Lenguaje

**Materialization**:
Transition from a service defined in the DSL to an implementation on a concrete technology stack, independent of the original DSL. It is considered when performance and scalability needs justify it.

**Capa de contrato**:
Nivel que describe el modelo de datos público y sus reglas de validación estructural y normalización tal como los percibe un consumidor del servicio.

**Vista de datos**:
Agrupación de usos de campo para describir un contrato, como un comando, un evento o un modelo de lectura, incluida la composición anidada de otras agrupaciones. Puede declarar reglas que combinen varios usos de campo.

**Comando**:
Especialización de una agrupación de campos con reglas, permisos, configuración API y referencias a resultados y errores. Puede declarar un resultado u omitirlo para indicar que no devuelve datos. Sus metadatos describen el contrato y no forman parte de los datos enviados.

**Query**:
Agrupación especializada de parámetros para una consulta, con permisos, configuración API y exactamente un resultado declarado.

**Continuation token**:
Valor opaco devuelto por un listado para continuar desde la última posición, vinculado a su consulta, filtros y orden. Se utiliza junto con un límite de resultados y no se combina con `offset`.

**Modelo de lectura**:
Agrupación especializada que describe los datos expuestos como resultado de lectura, con sus metadatos y reglas estructurales.

**Evento**:
Agrupación especializada que describe una ocurrencia y sus datos, con metadatos propios. Su contrato no exige un resultado de operación.

**Módulo**:
Unidad sin padre que describe un servicio y constituye su frontera de aislamiento respecto a otros servicios. Puede contener entidades y features; no es una feature raíz.

**Feature**:
Agrupación organizativa cuyo padre es un módulo u otra feature y que puede contener entidades y features anidadas. Su jerarquía forma el namespace interno y, por defecto, la ruta pública de la API.

**Flattened Inclusion**:
Composition that places a group's fields at the same level as the receiving model's fields, preserving their rules and resolving name conflicts through explicit renaming.

**Inclusión anidada**:
Composición que incorpora una agrupación como un campo compuesto con nombre explícito dentro del modelo receptor.

**Default CRUD Operations**:
Declaration on an entity that includes its CRUD operations without requiring each command to be described individually.

**Partial Update Message**:
Message describing changes to a model: an absent field retains its previous value. Supplied values and the resulting state preserve the constraints of the complete model.

**Fuente semántica**:
Datos RDF que declaran el significado y los contratos del servicio conforme a sus ontologías semánticas.

**Fuente visual**:
Datos RDF que describen ubicación, colores y otros detalles de representación de elementos semánticos conforme a una ontología visual, sin cambiar su significado.

**Mocking Source**:
Optional RDF data that enriches operation simulation according to a mocking ontology. It is selected when the prototype runs.

**Declaration Identifier**:
Stable identity of a specification element, independent of its name and namespace. It allows the same element to be recognized when reorganized and its derived representations to be traced.

**Identificador de entidad**:
Valor obligatorio y no nulo que identifica una instancia de entidad, sujeto a reglas del modelo sobre caracteres, longitud, prefijo y sufijo, sin quedar ligado a un generador concreto. Cada entidad señala un único uso de campo propio como identificador. Es distinto del identificador de la declaración que describe su tipo.

**Campo**:
Definición reutilizable de un dato, con nombre por defecto, tipo, normalizadores y restricciones originales. Su nombre se aplica a los usos que no declaran uno propio.

**Field Use**:
Reusable declaration that incorporates a field into one or more data views, with an optional name that replaces the default name for those uses. It preserves the field's normalizer sequence without adding local normalizers and may add constraints without replacing or weakening the original ones; the same field may have multiple uses in one view or in different views.

**Referencia a entidad**:
Tipo de dato cuyo valor identifica una instancia de la entidad destino, sin incorporar sus datos. Valida el tipo y formato de su identificador; la existencia del destino requiere una regla de negocio adicional.

**Colección**:
Tipo de dato que describe una lista ordenada de elementos de un tipo declarado. En los cambios parciales, una colección aportada sustituye la lista completa.

**Tipo de valor**:
Tipo escalar definido a partir de un primitivo u otro tipo de valor, conservando sus restricciones y añadiendo otras. Las cadenas de tipos base no forman ciclos; una enumeración es un tipo de valor con una restricción de pertenencia.

**Escenario de mocking**:
Caso que selecciona una operación y condiciones de entrada para producir una respuesta, un error declarado o éxito sin datos para un comando sin resultado. Forma parte de una fuente de mocking.

**Permiso**:
Concesión nombrada que una operación puede exigir para permitir su ejecución. Se requieren todas las concesiones declaradas; el acceso anónimo es una alternativa explícita y excluyente, y omitir ambas alternativas deniega el acceso.

**Error de negocio declarado**:
Resultado de error que una operación declara que puede producir, con código único dentro de su módulo y una vista de datos opcional para sus detalles. Es distinto de los fallos del motor.

**Modelo privado**:
Extensión del modelo público, definida en la capa de negocio, con campos y reglas no expuestos públicamente y mappings explícitos donde ambos modelos difieren.

**Capa de negocio**:
Nivel que describe los procesos de tratamiento de datos y las respuestas a eventos desde la perspectiva de un experto del dominio.

**Capa técnica**:
Nivel que declara las capacidades y opciones de implementación del servicio desde la perspectiva de un arquitecto o technical leader.

**Actividad declarativa**:
Paso de un workflow definido en el DSL para interactuar con el modelo declarado del servicio. La interacción declarativa con otros servicios descritos mediante DSL es una ampliación prevista.

**Actividad externa**:
Paso de un workflow implementado en código que interactúa con un sistema externo a partir de entradas explícitas, sin acceder directamente al estado del servicio principal.
_Evitar_: Actividad extensible como término que mezcle operaciones internas y externas.

**Opciones por defecto**:
Decisiones que el sistema aporta para ejecutar un prototipo cuando su especificación omite detalles de las capas inferiores.

**Prototype Profile**:
Explicit set of default options that allows a partial specification to run while distinguishing demonstration behavior from defined business behavior.

**Actor de prueba**:
Identidad de simulación con permisos asignados para comprobar el acceso a comandos y queries en el mock.

**Modelo semántico compartido**:
Especificación única sobre la que operan la edición visual y la textual, independientemente de la disposición gráfica utilizada para representarla.

### Evolución y gobernanza

**Publication**:
Immutable snapshot of the semantic, visual, mocking and, when present, governance sources, together with their effective model, offered as a contract to consumers. It versions that set and retains an identifier and fingerprint for each source and for the effective model. Those metadata identify and compare snapshots, but cannot by themselves reconstruct the source contents, the effective model or the comparison report. A publication is not an individual atomic source change.

**Línea base publicada**:
Publicación seleccionada como referencia para comparar una fuente candidata. El informe incluye todos los cambios incompatibles desde esta línea base hasta la publicación vigente, incluidas las publicaciones intermedias. La Aprobación de ruptura permanece vinculada a esta línea base. Puede ser anterior a la publicación inmediatamente precedente.

**Fuente de gobernanza**:
Fuente opcional que declara las políticas, autoridades y decisiones necesarias para gobernar un módulo, separada de sus fuentes semántica, visual y de mocking.

**Gobernanza heredada**:
Gobernanza que toma otra como base y añade extensiones sin debilitar sus reglas. Los conflictos entre la base y la extensión impiden obtener una gobernanza efectiva.

**Breaking Change Approval**:
Authenticated and recorded authorization from a user with the relevant authority to publish incompatible changes, linked to the baseline, candidate source, report and affected declarations. The approval permits publishing the breaking change but does not classify it as compatible.

**Effective Route**:
Current public route that represents a contract operation.

**Superseded Route**:
Previous route that continues responding directly and communicates its successor through `Link: <effective-route-URL>; rel="successor-version"`.

**Ruta redirigida**:
Ruta anterior que permanece soportada mediante `308 Permanent Redirect` a la ruta efectiva e incluye `Location: URL-de-la-ruta-efectiva`, conservando el método y el cuerpo de la petición.

**Ruta retirada**:
Ruta que ha dejado de estar soportada y responde con `410 Gone`.
