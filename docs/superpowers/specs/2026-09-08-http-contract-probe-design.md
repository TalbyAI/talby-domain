# HTTP/JSON contract and test-actor prototype

## Question

What minimum and coherent shape should routes, requests, responses, errors, and test-actor selection have to run the project example?

## Goal

Build a disposable logical prototype that can walk through a minimal CRUD and the `AprobarProyecto` command while showing the HTTP/JSON request, response, effective permissions, and in-memory state. The prototype validates the contract; it does not implement HTTP, SQLite, or real authentication.

## Artifact and limits

- `prototypes/http-contract-probe/index.html` will be a self-contained HTML file that opens by double-clicking.
- The folder will have its own `.gitignore` and no dependencies or references from production code.
- Executable logic will live in a pure module inside the `script`; the interface will only dispatch actions and render state.
- Data will live in memory.
- The continuation token will be a representative opaque string. The JWE authentication decided in the pagination ticket is outside this prototype.

## Model and flow

The fixture will use `Cliente`, `Proyecto`, and the nested `Periodo` group, with `importe` represented as a decimal string. Visible state will include actors, permissions, entities, the last request, the last response, and the incident history.

The thin walkthrough will be:

1. Create a project.
2. List it with `offset`.
3. Get it and partially update it.
4. Try an invalid `Periodo` and an unknown field.
5. List it with a continuation token and try an invalid token.
6. Run `AprobarProyecto` with an authorized and an unauthorized actor.
7. Delete the project.

## Provisional HTTP contract

| Operation | Route | Success response |
| --- | --- | --- |
| Create | `POST /projects` | `201` and the project |
| Get | `GET /projects/{id}` | `200` and the project |
| List by offset | `GET /projects?offset=0&limit=20` | `200` and a list wrapper |
| List by token | `GET /projects?continuationToken=...&limit=20` | `200` and a list wrapper |
| Update | `PATCH /projects/{id}` | `200` and the complete resulting state |
| Delete | `DELETE /projects/{id}` | `204` with no body |
| Approve | `POST /projects/commands/AprobarProyecto` | `200` and the declared result |

Individual models will not be wrapped. Lists will have `items` and `pagination`; only metadata for the selected mode will appear. Mixing `offset` and `continuationToken` will be rejected.

## Errors

All error responses will use [Problem Details for HTTP (RFC 9457)](https://www.rfc-editor.org/rfc/rfc9457.html) and the `application/problem+json` type. The object will retain standard members `type`, `title`, `status`, `detail`, and `instance`; `errors` will be Talby's only contract extension:

```json
{
  "type": "https://talby.ai/problems/validation-failed",
  "title": "La petición no cumple el contrato",
  "status": 422,
  "detail": "La petición no cumple el contrato.",
  "instance": "urn:talby:prototype:request:42",
  "errors": [
    {
      "code": "PERIOD_END_BEFORE_START",
      "rule": "fin >= inicio",
      "paths": ["/periodo/inicio", "/periodo/fin"],
      "details": {}
    }
  ]
}
```

The prototype mapping will be:

- `400`: invalid JSON, parameters, or token.
- `403`: absent, unknown, or insufficiently permitted actor.
- `404`: missing entity.
- `422`: JSON-valid but contract-invalid payload, or a declared business error.
- `500`: unexpected technical reference failure.

Incident paths will use JSON Pointer. A cross-field rule may identify several paths.

## Test actors

The selector will offer fixed profiles:

- `editor`: read, write, and approval.
- `reader`: read only.
- `anonymous`: no permissions.

The request will show `X-Test-Actor` as a simulated header. The selector will not allow grants to be edited. Omission or an unknown name will behave as denial by default; no fixture endpoint declares anonymous access.

## Prototype interface

The page will have four areas:

1. Question and scope.
2. Current state: actor, permissions, entities, and last transition.
3. Free exploration: buttons for every action.
4. Guided walkthroughs: authorized CRUD, invalid contract, pagination, and command authorization.

Each action will render the complete state again and show the request and response in contract language, not reducer internals.

## Check

Guided walkthroughs are the executable check for the prototype: they must demonstrate the happy path, an update that leaves an invalid state, unknown fields, ambiguous pagination/invalid token, and allowed/denied authorization. Do not add a test suite or test persistence; the HTML must open and work by itself.

## Out-of-scope decisions

- Production authentication or authorization.
- A real HTTP server, SQLite, TypeScript generation, or external client.
- Real JWE token signing.
- Exhaustive coverage of every command, query, or technical code.
- Changing decisions already closed for the effective model, cumulative constraints, or pagination.
