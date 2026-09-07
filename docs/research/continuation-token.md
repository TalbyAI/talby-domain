# Continuation token: contenido, codificación y vinculación

Investigación para [#6, «Decidir la codificación y vinculación del continuation token»](https://github.com/TalbyAI/talby-domain/issues/6), 7 de septiembre de 2026. El ticket es hijo del [mapa de la primera entrega (#1)](https://github.com/TalbyAI/talby-domain/issues/1).

Este documento decide solo el contrato conceptual del continuation token. No implementa el token ni fija todavía rutas, estados HTTP o el envoltorio de listados, que pertenecen al [#7](https://github.com/TalbyAI/talby-domain/issues/7).

## Recomendación

Usar un token autónomo, opaco para el consumidor, con **JWE Compact Serialization**, `alg=dir` y `enc=A256GCM` como perfil inicial. El contenido cifrado y autenticado contiene una huella de la petición efectiva y la posición de continuación; no contiene datos de autorización ni se interpreta como un permiso.

La huella debe calcularse después de normalizar la entrada y aplicar defaults:

```text
requestHash = base64url(SHA-256(JCS(petición-efectiva-sin-page-token-ni-limit)))
```

La petición efectiva incluye, como mínimo, la identidad estable de la operación de listado, el ámbito de recurso/tenant que afecta al resultado, los filtros normalizados y el orden efectivo con dirección, semántica de nulos y desempate estable. El orden efectivo incluye el identificador de entidad cuando sea necesario para hacerlo total y determinista.

El `limit` se valida con las reglas generales del listado, pero no forma parte de la huella: [AIP-158](https://google.aip.dev/158) exige conservar los demás argumentos y permite cambiar `page_size` en peticiones posteriores. La decisión local de no mezclar `offset` y token permanece vigente en el mapa del proyecto.

## Forma mínima propuesta

### Cabecera JWE protegida

```json
{
  "typ": "continuation+jwe",
  "alg": "dir",
  "enc": "A256GCM",
  "kid": "<identificador-de-clave-conocida>"
}
```

`kid` solo selecciona una clave de un catálogo local. La cabecera puede ser visible; no debe incluir filtros, consulta, posición ni otro estado interno.

### Payload cifrado

```json
{
  "v": 1,
  "op": "<identificador-estable-de-la-operación-de-listado>",
  "iat": 1788739200,
  "exp": 1788741000,
  "requestHash": "<base64url-de-32-octetos>",
  "position": "<cursor-interno>"
}
```

- `v` permite rechazar versiones no soportadas sin intentar reinterpretarlas.
- `op` evita reutilizar el token en otra operación; debe coincidir exactamente con la operación actual.
- `iat` y `exp` son fechas numéricas. `exp` es obligatorio en este perfil; la duración concreta es configuración del servicio y debe ser finita y documentada.
- `requestHash` vincula consulta, filtros, ámbito y orden sin repetirlos en claro en el token.
- `position` es la posición/cursor que necesita el ejecutor para continuar. Su estructura es privada al ejecutor y queda dentro del texto cifrado. Si se implementa como keyset cursor, debe contener todos los valores del orden efectivo y el desempate único; si se implementa como cursor del backend, el backend valida su forma y vigencia.

La estructura anterior es una **decisión propuesta para Talby**, no un formato definido por JWE, JWT, AIP-158 o JCS. Los nombres pueden cambiar en el contrato HTTP; las propiedades semánticas no deberían cambiar sin revisar esta decisión.

## Qué establecen las fuentes

### Paginación y opacidad

- [AIP-158, Opacity](https://google.aip.dev/158#opacity) exige que los page tokens sean cadenas opacas, seguras para URL y no analizables por el usuario; también advierte que codificar en Base64 un token transparente no es ofuscación suficiente.
- La misma guía limita el token a indicar desde dónde continuar y exige autorizar la petición como cualquier otra, por lo que un token nunca debe conceder acceso por sí mismo. También pide que los argumentos distintos de `page_size` se mantengan iguales y que una discrepancia produzca `INVALID_ARGUMENT`. [AIP-158, page token](https://google.aip.dev/158#guidance)
- AIP-158 permite que un servicio expire tokens almacenados y no exige que el cliente conozca el mecanismo. Esto respalda una expiración finita, pero no determina la duración de Talby. [AIP-158, Expiring page tokens](https://google.aip.dev/158#expiring-page-tokens)

### Integridad, confidencialidad y codificación

- [RFC 7515](https://www.rfc-editor.org/rfc/rfc7515.html#section-3.1) define JWS Compact como `BASE64URL(header).BASE64URL(payload).BASE64URL(signature)`. JWS protege el contenido mediante firma o MAC; Base64url solo representa octetos y no los oculta.
- [RFC 7516](https://www.rfc-editor.org/rfc/rfc7516.html#section-3.1) define JWE como mensaje cifrado y protegido contra modificaciones. Su forma compacta tiene cinco segmentos Base64url: cabecera protegida, clave cifrada, IV, ciphertext y etiqueta de autenticación. Por tanto, JWE cubre simultáneamente la confidencialidad del cursor y su autenticidad.
- [RFC 7518](https://www.rfc-editor.org/rfc/rfc7518.html#section-4.4) clasifica `dir` como uso directo de una clave simétrica compartida y [A256GCM](https://www.rfc-editor.org/rfc/rfc7518.html#section-5.3) como cifrado autenticado recomendado. Si se eligiera JWS/HS256 en una variante sin estado sensible, la clave debe tener al menos 256 bits y la comparación del MAC debe ser constante en tiempo. [RFC 7518, HMAC](https://www.rfc-editor.org/rfc/rfc7518.html#section-3.2)
- [RFC 4648](https://www.rfc-editor.org/rfc/rfc4648.html#section-3) define el alfabeto URL-safe y exige rechazar caracteres fuera del alfabeto salvo que el protocolo diga expresamente lo contrario. También exige una codificación canónica, con bits de relleno correctos; JOSE especifica Base64url sin `=` final. [RFC 7515, Base64url](https://www.rfc-editor.org/rfc/rfc7515.html#section-2)
- [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html#section-1) define JCS como representación JSON determinista, UTF-8 y ordenada, apta para producir una representación hashable para operaciones criptográficas. JCS no decide cuándo dos expresiones de filtros tienen el mismo significado: esa normalización semántica es responsabilidad del contrato de Talby.

### Validación criptográfica y temporal

- [RFC 8725](https://www.rfc-editor.org/rfc/rfc8725.html#section-3.1) exige que la aplicación configure el conjunto de algoritmos permitido y no acepte otro solo porque aparezca en `alg` o `enc`; cada clave debe estar asociada al algoritmo previsto. También exige validar todas las operaciones criptográficas y usar UTF-8. [RFC 8725, §§3.1–3.7](https://www.rfc-editor.org/rfc/rfc8725.html#section-3)
- RFC 8725 recomienda tipar explícitamente nuevos usos y hacer mutuamente excluyentes las reglas de validación para evitar sustitución entre clases de token. [RFC 8725, §§3.11–3.12](https://www.rfc-editor.org/rfc/rfc8725.html#section-3.11)
- [RFC 7519](https://www.rfc-editor.org/rfc/rfc7519.html#section-4.1) define la semántica de `exp` (no aceptar a partir del vencimiento), `nbf`, `iat`, `aud` y `jti`. `jti` puede ayudar a prevenir replay, pero hacerlo exige conservar estado de tokens consumidos; no es necesario para que una página pueda reintentarse.

### Orden y estado entre páginas

- [PostgreSQL, `LIMIT` y `OFFSET`](https://www.postgresql.org/docs/current/queries-limit.html) advierte que un orden que no determine de forma única las filas produce subconjuntos impredecibles.
- [Elasticsearch, `search_after`](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/paginate-search-results#search-after) exige repetir la misma query y sort, recomienda un desempate único y explica que un cambio de estado entre peticiones puede cambiar el orden; un PIT es el mecanismo explícito para conservar el estado. Sin PIT, la documentación advierte que pueden faltar o duplicarse resultados.

Estos documentos son ejemplos de contratos de paginación de primera parte, no dependencias ni requisitos directos para el motor de Talby.

## Reglas de validación y seguridad

Las siguientes reglas son la **inferencia de diseño** que aplica esos hechos al alcance de la primera entrega:

1. **Formato antes de descifrar:** aceptar solo la forma JWE Compact de cinco segmentos, sin espacios, saltos de línea ni caracteres fuera de Base64url y con un límite de longitud del perfil técnico. No hacer normalizaciones tolerantes ni doble decodificación.
2. **Algoritmos fijados por configuración:** aceptar únicamente `typ`, `alg`, `enc` y `kid` del perfil local. `kid` se resuelve en una tabla local; no se usa para construir consultas, cargar URLs o seleccionar claves arbitrarias. No aceptar `none`, otro `enc`, ni compresión no declarada; RFC 8725 desaconseja comprimir entradas de cifrado porque puede filtrar información por tamaño.
3. **Autenticar antes de confiar:** descifrar y verificar la etiqueta de autenticación antes de leer `v`, `op`, `exp`, `requestHash` o `position`. Cualquier fallo criptográfico produce token inválido.
4. **Payload estricto:** exigir UTF-8, JSON válido sin campos duplicados y el esquema de la versión conocida. Rechazar tipos, campos obligatorios ausentes, campos desconocidos si el perfil no los permite, posiciones vacías o excesivamente grandes y hashes con una longitud distinta de 32 octetos.
5. **Tiempo:** exigir `exp` presente y posterior al reloj actual, aplicar solo una tolerancia pequeña y explícita para desfase, y rechazar `iat > exp` o una edad máxima del token. La duración concreta es decisión de despliegue; no se deduce de los RFC.
6. **Vinculación de operación:** comparar `op` con la operación de listado actual. Si varios módulos comparten claves, añadir una identidad de emisor/audiencia y validarla; no reutilizar una clave global sin separar propósitos.
7. **Vinculación de petición:** reconstruir la petición efectiva con la misma normalización, defaults y reglas del ejecutor; incluir la consulta, filtros, ámbito que afecte al resultado, orden, direcciones, colación/semántica de `null` y desempate. Excluir `page_token` y `limit`; incluir cualquier parámetro adicional que cambie el conjunto o su orden. Comparar el `requestHash` recalculado con el del token y rechazar discrepancias.
8. **Orden total:** el orden predeterminado por identificador ya satisface el requisito local. Para otro orden, añadir el identificador estable como desempate cuando sea compatible y hacer que ese orden efectivo, no solo el texto pedido por el cliente, participe en la huella.
9. **Autorización independiente:** volver a autorizar cada petición y comprobar el ámbito/tenant actual. El token no sustituye permisos y no puede convertirse en una concesión de acceso. Si el resultado depende de una política por usuario, incluir una huella del ámbito efectivo en la petición canónica o invalidar por cualquier cambio de esa política.
10. **Error observable único:** alteración, formato inválido, clave desconocida, expiración, operación distinta, huella distinta o cursor no utilizable deben producir un error explícito de continuation token inválido y nunca reiniciar el listado silenciosamente. El detalle interno puede registrarse, pero no debe revelar si falló la firma, la consulta, el tenant o la posición.
11. **Replay:** permitir reintentar el mismo token mientras sea válido; es la semántica útil para repetir una petición fallida. No declarar tokens de un solo uso ni añadir una lista de `jti` consumidos sin una decisión posterior que acepte ese estado adicional.

## Qué significa «sin snapshot»

El token propuesto conserva autenticidad, confidencialidad y posición; no conserva una vista de lectura. Cada petición posterior ejecuta la consulta autorizada contra el estado disponible entonces, usando la misma petición efectiva y la posición del token.

Por tanto, inserciones, eliminaciones o cambios de valores de ordenación entre páginas pueden producir omisiones, repeticiones, aparición de elementos o desaparición de elementos. La firma/cifrado no evita ninguno de esos efectos. Esta es una **inferencia explícita del contrato**, respaldada por la distinción de Elasticsearch entre paginación stateless y PIT: una garantía entre páginas requeriría un mecanismo separado de snapshot/PIT, `resourceVersion`, transacción de lectura o almacenamiento equivalente.

La respuesta no debe prometer «resultado consistente», «vista congelada», «exactly once» ni ausencia de duplicados. Si en el futuro se exige esa garantía, será otra decisión: el token deberá ligar además un identificador de snapshot y su expiración, y el servicio deberá conservar o reconstruir ese estado.

## Alternativas descartadas para esta entrega

- **JSON o Base64 sin protección:** no vincula la petición de forma fiable y deja el estado legible o modificable; contradice la opacidad exigida por AIP-158.
- **JWS/HS256 con payload transparente:** autentica el contenido, pero no oculta un cursor o filtros incluidos en el payload. Solo sería suficiente si se demuestra que todo el payload es público y no representa estado interno.
- **Handle aleatorio con estado en servidor:** proporciona opacidad fuerte, pero añade almacenamiento, expiración, limpieza y una superficie de estado que no es necesaria para el perfil autónomo JWE.
- **Token de un solo uso:** impediría reintentos normales y exige guardar `jti` consumidos; no aporta valor para la paginación inicial.
- **Snapshot/PIT implícito:** convertiría la continuación en una garantía de consistencia y exigiría persistir/retener una vista. Está fuera del alcance fijado por el mapa.

## Implicaciones para el contrato posterior

- El contrato HTTP debe documentar `continuationToken + limit`, la exclusión mutua con `offset` y el error estable para token inválido; los códigos HTTP exactos quedan para [#7](https://github.com/TalbyAI/talby-domain/issues/7).
- Las pruebas de aceptación deben cambiar filtros, orden, operación y ámbito por separado y comprobar que cada cambio se rechaza; deben comprobar que cambiar solo `limit` sí continúa.
- Debe existir un caso de token manipulado, expirado, de otra operación y con cursor inválido, y ningún caso debe reiniciar silenciosamente.
- La evidencia no debe inspeccionar la estructura interna de `position`; solo el comportamiento público y la ausencia de exposición del payload cifrado.

## Fuentes primarias

- [Google AIP-158 — Pagination](https://google.aip.dev/158).
- [RFC 4648 — Base-N Encodings](https://www.rfc-editor.org/rfc/rfc4648.html).
- [RFC 7515 — JSON Web Signature](https://www.rfc-editor.org/rfc/rfc7515.html).
- [RFC 7516 — JSON Web Encryption](https://www.rfc-editor.org/rfc/rfc7516.html).
- [RFC 7518 — JSON Web Algorithms](https://www.rfc-editor.org/rfc/rfc7518.html).
- [RFC 7519 — JSON Web Token](https://www.rfc-editor.org/rfc/rfc7519.html).
- [RFC 8725 — JSON Web Token Best Current Practices](https://www.rfc-editor.org/rfc/rfc8725.html).
- [RFC 8785 — JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785.html).
- [PostgreSQL documentation — `LIMIT` and `OFFSET`](https://www.postgresql.org/docs/current/queries-limit.html).
- [Elasticsearch Reference — Paginate search results](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/paginate-search-results).

Los hechos normativos y documentales están atribuidos a esas fuentes. El formato de payload, el uso de JWE para ocultar `position`, la huella `requestHash`, la exclusión de `limit`, la política de replay y la ausencia de snapshot son decisiones o inferencias específicas de Talby, señaladas como tales arriba.
