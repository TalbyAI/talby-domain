# Lenguaje de servicios empresariales

Vocabulario del proyecto para describir y ejecutar servicios y trasladarlos a un stack tecnológico concreto.

## Lenguaje

**Asentamiento**:
Transición de un servicio definido en el DSL a una implementación en un stack tecnológico concreto, independiente del DSL original. Se plantea cuando las necesidades de rendimiento y escalabilidad lo justifiquen.

**Capa de contrato**:
Nivel que describe el modelo de datos público y sus reglas de validación estructural y normalización tal como los percibe un consumidor del servicio.

**Vista de datos**:
Agrupación de campos y de otras agrupaciones para describir un contrato, como un comando, un evento o un modelo de lectura. Los modelos de entrada pueden añadir validaciones que relacionen varios campos.

**Comando**:
Especialización de una agrupación de campos con reglas, permisos, configuración API y referencias a resultados y errores. Sus metadatos describen el contrato y no forman parte de los datos enviados.

**Query**:
Agrupación especializada de parámetros para una consulta, con permisos, configuración API y un resultado asociado.

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

**Inclusión aplanada**:
Composición que incorpora los campos de una agrupación al mismo nivel que los del modelo receptor, conservando sus reglas y resolviendo conflictos de nombres mediante renombrados explícitos.

**Inclusión anidada**:
Composición que incorpora una agrupación como un campo compuesto con nombre explícito dentro del modelo receptor.

**CRUD por defecto**:
Declaración sobre una entidad que incorpora sus operaciones CRUD sin exigir describir cada comando individualmente.

**Mensaje de cambios parciales**:
Entrada que describe modificaciones de un modelo: un campo ausente conserva su valor anterior. Los valores aportados y el estado resultante mantienen las restricciones del modelo completo.

**Fuente semántica**:
Datos RDF que declaran el significado y los contratos del servicio conforme a sus ontologías semánticas.

**Fuente visual**:
Datos RDF que describen ubicación, colores y otros detalles de representación de elementos semánticos conforme a una ontología visual, sin cambiar su significado.

**Fuente de mocking**:
Datos RDF opcionales que enriquecen la simulación de operaciones conforme a una ontología de mocking. Se seleccionan al ejecutar el prototipo.

**Identificador de declaración**:
Identidad estable de un elemento de la especificación, independiente de su nombre y namespace. Permite reconocer el mismo elemento al reorganizarlo y rastrear sus representaciones derivadas.

**Identificador de entidad**:
Valor que identifica una instancia de entidad, sujeto a reglas del modelo sobre caracteres, longitud, prefijo y sufijo, sin quedar ligado a un generador concreto. Es distinto del identificador de la declaración que describe su tipo.

**Escenario de mocking**:
Caso que selecciona una operación y condiciones de entrada para producir una respuesta o error declarado. Forma parte de una fuente de mocking.

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

**Perfil de prototipo**:
Conjunto explícito de opciones por defecto que permite ejecutar una especificación parcial, distinguiendo el comportamiento de demostración del negocio definido.

**Actor de prueba**:
Identidad de simulación con permisos asignados para comprobar el acceso a comandos y queries en el mock.

**Modelo semántico compartido**:
Especificación única sobre la que operan la edición visual y la textual, independientemente de la disposición gráfica utilizada para representarla.
