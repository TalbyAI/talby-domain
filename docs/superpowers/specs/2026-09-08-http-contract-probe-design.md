# Prototipo del contrato HTTP/JSON y de actores de prueba

## Pregunta

¿Qué forma mínima y coherente deben tener las rutas, peticiones, respuestas, errores y selección del actor de prueba para ejecutar el ejemplo de proyectos?

## Objetivo

Construir un prototipo lógico desechable que permita recorrer un CRUD mínimo y el comando `AprobarProyecto`, viendo la petición HTTP/JSON, la respuesta, los permisos efectivos y el estado en memoria. El prototipo sirve para validar el contrato, no para implementar HTTP, SQLite ni autenticación real.

## Artefacto y límites

- `prototypes/http-contract-probe/index.html` será un HTML autocontenido, abrible con doble clic.
- La carpeta tendrá su propio `.gitignore` y no tendrá dependencias ni referencias desde el código de producción.
- La lógica ejecutable estará en un módulo puro dentro del `script`; la interfaz solo despachará acciones y renderizará el estado.
- Los datos vivirán en memoria.
- El continuation token será una cadena opaca representativa. La autenticación JWE decidida en el ticket de paginación queda fuera de este prototipo.

## Modelo y flujo

El fixture usará `Cliente`, `Proyecto` y el grupo anidado `Periodo`, con `importe` como decimal representado por cadena. El estado visible incluirá actores, permisos, entidades, última petición, última respuesta y el historial de incidencias.

El recorrido delgado será:

1. Crear un proyecto.
2. Listarlo con `offset`.
3. Obtenerlo y actualizarlo parcialmente.
4. Intentar un `Periodo` inválido y un campo desconocido.
5. Listarlo con continuation token e intentar un token inválido.
6. Ejecutar `AprobarProyecto` con un actor autorizado y uno no autorizado.
7. Eliminar el proyecto.

## Contrato HTTP provisional

| Operación | Ruta | Respuesta de éxito |
| --- | --- | --- |
| Crear | `POST /projects` | `201` y el proyecto |
| Obtener | `GET /projects/{id}` | `200` y el proyecto |
| Listar por offset | `GET /projects?offset=0&limit=20` | `200` y envoltorio de lista |
| Listar por token | `GET /projects?continuationToken=...&limit=20` | `200` y envoltorio de lista |
| Actualizar | `PATCH /projects/{id}` | `200` y el estado completo resultante |
| Eliminar | `DELETE /projects/{id}` | `204` sin cuerpo |
| Aprobar | `POST /projects/commands/AprobarProyecto` | `200` y el resultado declarado |

Los modelos individuales no tendrán envoltorio. Las listas tendrán `items` y `pagination`; solo aparecerán los metadatos propios de la modalidad usada. Se rechazará mezclar `offset` y `continuationToken`.

## Errores

Todas las respuestas de error usarán [Problem Details para HTTP (RFC 9457)](https://www.rfc-editor.org/rfc/rfc9457.html) y el tipo `application/problem+json`. El objeto conservará los miembros estándar `type`, `title`, `status`, `detail` e `instance`; `code`, `category` e `issues` serán extensiones del contrato de Talby:

```json
{
  "type": "https://talby.ai/problems/validation-failed",
  "title": "La petición no cumple el contrato",
  "status": 422,
  "detail": "La petición no cumple el contrato.",
  "instance": "urn:talby:prototype:request:42",
  "code": "VALIDATION_FAILED",
  "category": "validation",
  "issues": [
    {
      "code": "PERIOD_END_BEFORE_START",
      "rule": "fin >= inicio",
      "paths": ["/periodo/inicio", "/periodo/fin"],
      "details": {}
    }
  ]
}
```

El mapeo del prototipo será:

- `400`: JSON, parámetros o token inválidos.
- `403`: actor ausente, desconocido o sin todos los permisos.
- `404`: entidad inexistente.
- `422`: payload válido como JSON pero inválido según el contrato, o error de negocio declarado.
- `500`: fallo técnico inesperado de referencia.

Las rutas de incidencias usarán JSON Pointer. Una regla entre campos podrá señalar varias rutas.

## Actores de prueba

El selector ofrecerá perfiles fijos:

- `editor`: lectura, escritura y aprobación.
- `reader`: solo lectura.
- `anonymous`: sin permisos.

La petición mostrará `X-Test-Actor` como cabecera simulada. El selector no permitirá editar concesiones. La omisión o el nombre desconocido se comportarán como denegación por defecto; ningún endpoint del fixture declara acceso anónimo.

## Interfaz del prototipo

La página tendrá cuatro zonas:

1. Pregunta y alcance.
2. Estado actual: actor, permisos, entidades y última transición.
3. Exploración libre: botones para todas las acciones.
4. Recorridos guiados: CRUD autorizado, contrato inválido, paginación y autorización del comando.

Cada acción volverá a renderizar el estado completo y mostrará la petición y la respuesta en lenguaje de contrato, no detalles internos del reducer.

## Comprobación

Los recorridos guiados serán la comprobación ejecutable del prototipo: deben demostrar el camino feliz, una actualización que deja un estado inválido, campos desconocidos, paginación ambigua/token inválido y autorización permitida/denegada. No se añadirá una suite de pruebas ni persistencia de prueba; el HTML debe abrirse y funcionar por sí solo.

## Decisiones fuera de alcance

- Autenticación o autorización de producción.
- Servidor HTTP real, SQLite, generación TypeScript y cliente externo.
- Firma JWE real del token.
- Cobertura exhaustiva de todos los comandos, queries o códigos técnicos.
- Cambiar las decisiones ya cerradas sobre modelo efectivo, restricciones acumulativas o paginación.
