# Especificación progresiva en tres capas

La especificación separa contrato público de datos, comportamiento de negocio y decisiones técnicas, con opciones por defecto que permiten ejecutar un prototipo definiendo solo el contrato. Se elige esta progresión para explorar un servicio antes de completar su comportamiento e implementación, en lugar de exigir una definición exhaustiva inicial.

Los defaults pertenecen a un perfil explícito y deben distinguirse del comportamiento de negocio definido; su versionado se aplaza hasta la versión 1.0 del producto. Negocio añade condiciones semánticas y técnica implementa las garantías declaradas; las contradicciones deben detectarse, sin cambiar silenciosamente el comportamiento. El comportamiento exacto de los defaults y las fases de comprobación siguen pendientes.
