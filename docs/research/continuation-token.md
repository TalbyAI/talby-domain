# Continuation token: contents, encoding, and binding

Research for [#6, “Decide continuation-token encoding and binding”](https://github.com/TalbyAI/talby-domain/issues/6), September 7, 2026. The ticket is a child of the [first-delivery map (#1)](https://github.com/TalbyAI/talby-domain/issues/1).

This document decides only the conceptual contract of the continuation token. It does not implement the token or yet fix routes, HTTP statuses, or the list wrapper; those belong to [#7](https://github.com/TalbyAI/talby-domain/issues/7).

## Recommendation

Use a self-contained token that is opaque to the consumer, with **JWE Compact Serialization**, `alg=dir`, and `enc=A256GCM` as the initial profile. The encrypted and authenticated content contains a fingerprint of the effective request and the continuation position; it contains no authorization data and is not interpreted as a permission. This profile limits visibility to a tenant-only scope.

The fingerprint must be calculated after normalizing the input and applying defaults. The effective request is materialized using the single I-JSON schema defined below; the original request is not serialized directly:

```text
canonicalJson = JCS(petición-efectiva)
requestHash = base64url_sin_relleno(SHA-256(UTF-8(canonicalJson)))
```

### Canonical effective-request schema

This is the only schema in the profile for `requestHash`; all its top-level members are required, `filters` may be an empty list, and `ordering` may not be empty. Operation, resource, and field identifiers are stable **Declaration Identifiers** from the contract, not route names or visible labels.

```json
{
  "filters": [
    {
      "field": "<identificador estable del campo>",
      "operands": ["<valor en forma canónica>"],
      "operator": "<operador normalizado>"
    }
  ],
  "operation": "<identificador estable de la operación de listado>",
  "ordering": [
    {
      "direction": "asc",
      "field": "<identificador estable del campo>",
      "nulls": "last",
      "tieBreaker": false
    },
    {
      "direction": "asc",
      "field": "<identificador estable del campo identificador de entidad>",
      "nulls": "last",
      "tieBreaker": true
    }
  ],
  "scope": {
    "resource": "<identificador estable del recurso>",
    "tenant": "<identificador de tenant canónico o null>"
  }
}
```

- `filters` contains already-normalized atomic predicates. Each object requires `field`, `operator`, and `operands`; `operands` preserves the operator's semantic order and may be empty only for operators with no operands. If an operator declares set semantics, its operands are sorted lexicographically by their JCS bytes; otherwise their order is preserved. The filter list is sorted lexicographically by the UTF-8 bytes of its own JCS representation. An unknown operator or incompatible arity is rejected.
- `ordering` is the effective sequence, including defaults, with left-to-right precedence. Each element requires a direction and null semantics. `tieBreaker: true` identifies stable keys added to make the ordering total; the last key must be a unique tie-breaker, normally the entity identifier. A field is not repeated.
- `scope.tenant` contains the effective tenant or `null` for an explicit global scope. Absence is never used in this schema: a default is materialized as a member, and a field without a default that is missing causes the request to be rejected. `null` is a present value and is accepted only where the contract declares it nullable.
- This profile permits tenant-only visibility: for a combination of operation, resource, and tenant, every authorized principal observes the same row set. Permission differences may allow or deny the operation, but may not filter its results. Therefore, principal identity and a per-user policy are not included in `scope`. If a policy produces different sets for two principals in the same tenant, the list cannot issue or accept this profile; it must declare a future variant with a canonical fingerprint of the effective policy.
- `operands` uses the canonical forms from [`formas-lexicas.md`](formas-lexicas.md): text and identifiers as Unicode scalar-value strings without NFC, case folding, or locale; decimal as a canonical decimal string; date and instant as their canonical strings; boolean as a JSON boolean; and `null` only when the type and operator allow it. Supported collections preserve the order defined by the operator. Unsupported objects, non-interoperable numbers, isolated Unicode surrogates, duplicate fields or keys, and values that do not meet their form are rejected before the fingerprint is calculated.
- Every argument that changes the result set or ordering must have a representation in this schema. `page_token`, `limit`, and `offset` do not: `page_token` and `limit` are outside the fingerprint, and a request with `offset` cannot use this profile.

`JCS` is applied to the I-JSON object after these semantic decisions. The output has no spaces or final line break; the hash uses exactly its UTF-8 bytes and `base64url_sin_relleno` contains no `=`.

Vectors that must produce exactly the same canonical JSON and hash in every runtime:

**Vector A**

```text
JCS = {"filters":[{"field":"status","operands":["active"],"operator":"eq"}],"operation":"projects.list.v1","ordering":[{"direction":"desc","field":"createdAt","nulls":"last","tieBreaker":false},{"direction":"asc","field":"id","nulls":"last","tieBreaker":true}],"scope":{"resource":"projects","tenant":"tenant_acme"}}
requestHash = Dqcm2yIU_2kRQxMALXLku7ryn1vCWbqVw5e_GfdgmoI
```

**Vector B**

The input value for `budget` was `"1.20"` and the request had global scope; the effective form preserves `"1.2"` and materializes `tenant: null`.

```text
JCS = {"filters":[{"field":"budget","operands":["1.2"],"operator":"gte"},{"field":"startsAt","operands":["2026-09-07T12:00:00.000Z"],"operator":"lt"}],"operation":"projects.list.v1","ordering":[{"direction":"asc","field":"id","nulls":"last","tieBreaker":true}],"scope":{"resource":"projects","tenant":null}}
requestHash = 24Av_HVtLDjyn9zo9czY81GdYINTWFNCQNUkPsVWZg0
```

`limit` is validated using the general list rules but is not part of the fingerprint: [AIP-158](https://google.aip.dev/158) requires the other arguments to remain the same and permits `page_size` to change in later requests. The local decision not to mix `offset` and token remains in force in the project map.

## Proposed minimum form

### Protected JWE header

```json
{
  "typ": "continuation+jwe",
  "alg": "dir",
  "enc": "A256GCM",
  "kid": "<identificador-de-clave-conocida>"
}
```

`kid` only selects a key from a local catalog. The header may be visible; it must not include filters, the query, the position, or other internal state.

### Encrypted payload

```json
{
  "v": 1,
  "op": "<identificador-estable-de-la-operación-de-listado>",
  "iat": 1788739200,
  "exp": 1788741000,
  "requestHash": "<base64url_sin_relleno-de-32-octetos>",
  "position": "<cursor-interno>"
}
```

- `v` allows unsupported versions to be rejected without trying to reinterpret them.
- `op` prevents reuse of the token for another operation; it must match the current operation exactly.
- `iat` and `exp` are numeric dates. `exp` is required in this profile; the exact duration is service configuration and must be finite and documented.
- `requestHash` binds the query, filters, tenant-only scope, and ordering without repeating them in clear text in the token.
- `position` is a self-contained keyset cursor: it contains all values from `ordering`, including null markers, in the same effective order and with the unique tie-breaker. Its private structure remains inside the ciphertext and does not require a token-state lookup. The executor validates its form and types when using it; a cursor that cannot reconstruct the position is rejected. A backend-state cursor is not chosen for this profile.

The structure above is a **proposed decision for Talby**, not a format defined by JWE, JWT, AIP-158, or JCS. Names may change in the HTTP contract; semantic properties should not change without revisiting this decision.

## What the sources establish

### Pagination and opacity

- [AIP-158, Opacity](https://google.aip.dev/158#opacity) requires page tokens to be opaque, URL-safe strings that are not parseable by the user; it also warns that Base64-encoding a transparent token is not sufficient obfuscation.
- The same guide limits the token to indicating where to continue and requires the request to be authorized like any other request, so a token must never grant access by itself. It also asks for arguments other than `page_size` to remain equal and for a discrepancy to produce `INVALID_ARGUMENT`. [AIP-158, page token](https://google.aip.dev/158#guidance)
- AIP-158 allows a service to expire stored tokens and does not require the client to know the mechanism. This supports finite expiration but does not determine Talby's duration. [AIP-158, Expiring page tokens](https://google.aip.dev/158#expiring-page-tokens)

### Integrity, confidentiality, and encoding

- [RFC 7515](https://www.rfc-editor.org/rfc/rfc7515.html#section-3.1) defines JWS Compact as `BASE64URL(header).BASE64URL(payload).BASE64URL(signature)`. JWS protects content through a signature or MAC; Base64url only represents octets and does not hide them.
- [RFC 7516](https://www.rfc-editor.org/rfc/rfc7516.html#section-3.1) defines JWE as a message encrypted and protected against modification. Its compact form has five Base64url segments: protected header, encrypted key, IV, ciphertext, and authentication tag. Therefore JWE covers cursor confidentiality and authenticity together.
- [RFC 7518](https://www.rfc-editor.org/rfc/rfc7518.html#section-4.4) classifies `dir` as direct use of a shared symmetric key and [A256GCM](https://www.rfc-editor.org/rfc/rfc7518.html#section-5.3) as recommended authenticated encryption. If JWS/HS256 were selected for a variant without sensitive state, the key would need at least 256 bits and MAC comparison would need to be constant-time. [RFC 7518, HMAC](https://www.rfc-editor.org/rfc/rfc7518.html#section-3.2)
- [RFC 4648](https://www.rfc-editor.org/rfc/rfc4648.html#section-3) defines the URL-safe alphabet and requires characters outside it to be rejected unless the protocol expressly says otherwise. It also requires canonical encoding with correct padding bits; JOSE specifies Base64url without a final `=`. [RFC 7515, Base64url](https://www.rfc-editor.org/rfc/rfc7515.html#section-2)
- [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html#section-1) defines JCS as deterministic, UTF-8, ordered JSON representation suitable for producing a hashable representation for cryptographic operations. JCS does not decide when two filter expressions have the same meaning; that semantic normalization is Talby's contract responsibility.

### Cryptographic and temporal validation

- [RFC 8725](https://www.rfc-editor.org/rfc/rfc8725.html#section-3.1) requires the application to configure the permitted algorithm set and not accept another merely because it appears in `alg` or `enc`; each key must be associated with its intended algorithm. It also requires validating every cryptographic operation and using UTF-8. [RFC 8725, §§3.1–3.7](https://www.rfc-editor.org/rfc/rfc8725.html#section-3)
- RFC 8725 recommends explicitly typing new uses and making validation rules mutually exclusive to prevent substitution between token classes. [RFC 8725, §§3.11–3.12](https://www.rfc-editor.org/rfc/rfc8725.html#section-3.11)
- [RFC 7519](https://www.rfc-editor.org/rfc/rfc7519.html#section-4.1) defines the semantics of `exp` (do not accept from expiration onward), `nbf`, `iat`, `aud`, and `jti`. `jti` may help prevent replay, but doing so requires retaining state for consumed tokens; it is not necessary for a page to be retried.

### Ordering and state between pages

- [PostgreSQL, `LIMIT` and `OFFSET`](https://www.postgresql.org/docs/current/queries-limit.html) warns that an ordering that does not uniquely determine rows produces unpredictable subsets.
- [Elasticsearch, `search_after`](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/paginate-search-results#search-after) requires repeating the same query and sort, recommends a unique tie-breaker, and explains that state changes between requests may change ordering; a PIT is the explicit mechanism for preserving state. Without PIT, the documentation warns that results may be missing or duplicated.

These documents are examples of first-party pagination contracts, not dependencies or direct requirements for the Talby engine.

## Validation and security rules

The following rules are the **design inference** that applies those facts to the first-delivery scope:

1. **Format before decryption:** accept only the five-segment JWE Compact form, without spaces, line breaks, or characters outside Base64url, and with a technical-profile length limit. Do not perform tolerant normalization or double decoding.
2. **Algorithms fixed by configuration:** accept only the `typ`, `alg`, `enc`, and `kid` values of the local profile. Resolve `kid` in a local table of direct keys exactly 32 octets (256 bits); do not use it to construct queries, load URLs, or select arbitrary keys. For `alg=dir`, the second JWE encrypted-key segment must be empty. For `enc=A256GCM`, the IV must be 12 octets (96 bits) and the tag 16 octets (128 bits) after their Base64url segments are decoded. The generator obtains a new random IV through a CSPRNG for each token and keeps no per-token registry. Therefore this profile provides a probabilistic non-collision guarantee, not an absolute prohibition: issuers and restarts must obtain independent outputs, and deployment must limit the total tokens issued per key, across all issuers and restarts, to `N ≤ 2^32`. Thus the birthday bound `N(N-1)/(2·2^96)` stays below `2^-32`; the aggregate quota is coordinated per key and the key is rotated before it is reached. If that global quota cannot be coordinated, use another profile with unique-IV assignment or state. Stateless validation cannot detect a repeated IV by itself; if an issuer or operational control detects a repeat, it must retire the affected key and invalidate its tokens, while any token with invalid format, decryption, or tag is rejected as an invalid continuation token. If the CSPRNG fails or the quota is exhausted, do not issue the token. Do not accept `none`, another `enc`, or undeclared compression; RFC 8725 discourages compressing encrypted inputs because size can leak information.
3. **Authenticate before trusting:** decrypt and verify the authentication tag before reading `v`, `op`, `exp`, `requestHash`, or `position`. Any cryptographic failure produces an invalid token.
4. **Strict payload:** require UTF-8, valid JSON without duplicate fields, and the known version's schema. Reject wrong types, missing required fields, unknown fields when the profile does not allow them, empty or excessively large positions, and hashes with a length other than 32 octets.
5. **Time:** require `exp` to be present and later than the current clock, apply only a small explicit clock-skew tolerance, and reject `iat > exp` or a maximum token age. The exact duration is a deployment decision; it is not derived from the RFCs.
6. **Operation binding:** compare `op` with the current list operation. If multiple modules share keys, add and validate issuer/audience identity; do not reuse a global key without separating purposes.
7. **Request binding:** rebuild the effective object from the canonical schema using the executor's same normalization, defaults, and rules; include operation identity, filters, any scope affecting results, effective ordering, directions, collation/null semantics, and tie-breaker. Exclude `page_token` and `limit`; include every additional parameter that changes the set or ordering. Compare the recalculated `requestHash` with the token's value and reject discrepancies.
8. **Total ordering:** identifier ordering already satisfies the local default. For another ordering, add the stable identifier as a tie-breaker when compatible, and make that effective ordering—not only the text requested by the client—participate in the fingerprint.
9. **Independent authorization:** authorize every request again and check the current scope/tenant. The token does not replace permissions and cannot become an access grant. This profile requires the tenant-only restriction described in the schema: a per-user policy that changes visible rows prevents the token from being issued or accepted, rather than treating two requests with the same `scope` as equivalent. A future variant may include a canonical fingerprint of that policy in the effective request.
10. **Single observable error:** alteration, invalid format, unknown key, expiration, different operation, different fingerprint, or unusable cursor must produce an explicit invalid-continuation-token error and must never silently restart the list. Internal detail may be logged, but must not reveal whether signature, query, tenant, or position validation failed.
11. **Replay:** allow the same token to be retried while valid; this is the useful semantics for repeating a failed request. Do not declare one-use tokens or add a consumed-`jti` list without a later decision that accepts that additional state.

## Meaning of “without snapshot”

The proposed token preserves authenticity, confidentiality, and position; it does not preserve a read view. Each later request runs the authorized query against the state available at that time, using the same effective request and the token's position.

Therefore, inserts, deletions, or changes to ordering values between pages may cause omissions, repetitions, elements to appear, or elements to disappear. Signing/encryption prevents none of these effects. This is an **explicit contract inference**, supported by Elasticsearch's distinction between stateless pagination and PIT: a between-page guarantee would require a separate snapshot/PIT mechanism, `resourceVersion`, read transaction, or equivalent storage.

The response must not promise “consistent results,” a “frozen view,” “exactly once,” or the absence of duplicates. If that guarantee is required in the future, it will be another decision: the token must also bind a snapshot identifier and its expiration, and the service must retain or reconstruct that state.

## Alternatives rejected for this delivery

- **Unprotected JSON or Base64:** does not reliably bind the request and leaves state readable or modifiable; it contradicts the opacity required by AIP-158.
- **JWS/HS256 with transparent payload:** authenticates the content but does not hide a cursor or filters in the payload. It would be sufficient only if all payload content were proven public and did not represent internal state.
- **Random handle with server-side state:** provides strong opacity but adds storage, expiration, cleanup, and a state surface that is not necessary for the self-contained JWE profile.
- **One-use token:** would prevent normal retries and requires storing consumed `jti` values; it adds no value for initial pagination.
- **Implicit snapshot/PIT:** would turn continuation into a consistency guarantee and require retaining a view. It is outside the scope fixed by the map.

## Implications for the later contract

- The HTTP contract must document `continuationToken + limit`, mutual exclusion with `offset`, and the stable error for an invalid token; exact HTTP status codes belong to [#7](https://github.com/TalbyAI/talby-domain/issues/7).
- Acceptance tests must change filters, ordering, operation, and scope separately and verify that each change is rejected; they must verify that changing only `limit` continues. Client and engine must compare the previous JCS vectors, including their UTF-8 bytes and `requestHash`, and verify that equivalent spellings reduce to the same effective request.
- Cryptographic acceptance must generate a valid token and check five segments, an empty second segment, a 32-octet direct key, a 12-octet IV, and a 16-octet tag. The test must inject a deterministic CSPRNG seam that returns the distinct 12-octet IVs `000102030405060708090a0b` and `0c0d0e0f1011121314151617` on successive calls, then assert that the first and second tokens use those exact IVs; production must still obtain fresh IVs from an independent CSPRNG. Deployment must enforce the aggregate per-key quota and rotate before exceeding `N`. A missing CSPRNG or exhausted quota prevents issuance. A 16/24/31/33-octet key, a non-empty second segment, an IV of another length, a tag other than 16 octets, an invalid tag, or a modified payload must be rejected; validation does not need a lookup to detect repeated IVs.
- There must be a manipulated, expired, wrong-operation, and invalid-cursor token case, and no case may silently restart.
- The tenant-only restriction must be verified: two principals authorized for the same tenant and request observe the same set and `requestHash`; if a per-user policy would change visible rows, the list rejects this profile before issuing or validating the token and does not treat the requests as equivalent.
- Evidence must not inspect the internal structure of `position`; it should inspect only public behavior, which requires no per-token state lookup and must not expose the encrypted payload.

## Primary sources

- [Google AIP-158 — Pagination](https://google.aip.dev/158).
- [RFC 4648 — Base-N Encodings](https://www.rfc-editor.org/rfc/rfc4648.html).
- [RFC 7515 — JSON Web Signature](https://www.rfc-editor.org/rfc/rfc7515.html).
- [RFC 7516 — JSON Web Encryption](https://www.rfc-editor.org/rfc/rfc7516.html).
- [RFC 7518 — JSON Web Algorithms](https://www.rfc-editor.org/rfc/rfc7518.html).
- [RFC 7519 — JSON Web Token](https://www.rfc-editor.org/rfc/rfc7519.html).
- [RFC 7493 — The I-JSON Message Format](https://www.rfc-editor.org/rfc/rfc7493.html).
- [RFC 8725 — JSON Web Token Best Current Practices](https://www.rfc-editor.org/rfc/rfc8725.html).
- [RFC 8785 — JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785.html).
- [NIST SP 800-38D — Galois/Counter Mode (GCM) and GMAC](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf).
- [PostgreSQL documentation — `LIMIT` and `OFFSET`](https://www.postgresql.org/docs/current/queries-limit.html).
- [Elasticsearch Reference — Paginate search results](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/paginate-search-results).

Normative and documentary facts are attributed to those sources. The payload format, using JWE to hide `position`, the `requestHash` fingerprint, excluding `limit`, replay policy, and absence of a snapshot are Talby-specific decisions or inferences, identified as such above.
