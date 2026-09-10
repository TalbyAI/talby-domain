# Contract acceptance seam prototype

## Status

Design approved in conversation; implementation remains pending review of this
written specification.

## Question

What is the smallest executable artifact that demonstrates the public seam from
a Turtle contract through verification, a TypeScript client, an HTTP/JSON mock,
and a logical SQLite observation while checking client/engine conformance and a
compatibility report without making implementation details part of the
contract?

## Decision

Create one disposable, self-contained HTML prototype at
`prototypes/contract-acceptance-seam/index.html`. It will be runnable by
double-click, have no dependencies, and contain a pure logical module behind a
thin interface. Its own `.gitignore` will keep local artifacts out of the
repository. It will not be referenced by production code or by another
prototype.

The prototype is a contract-level probe, not an implementation proof. Its
Turtle, verification, TypeScript-client, HTTP/mock, and SQLite stages will be
explicitly labeled logical adapters. The later implementation must replace
those adapters with the selected libraries and real persistence while
preserving the observable cases captured here.

## Boundary and state

The visible flow is:

```text
Semantic Source + optional Mocking Source
        -> verification
        -> effective model and Prototype Profile view
        -> TypeScript client call
        -> HTTP/JSON mock
        -> logical SQLite entity state
        -> conformance and compatibility reports
```

The fixture is a minimal project-management service based on the approved
example. It contains `Cliente`, `Proyecto`, a project-to-client Entity
Reference, a Nested Inclusion named `Periodo` with `fin >= inicio`, an exact
decimal amount, a declared Event, Default CRUD Operations, and the
`AprobarProyecto` Command with a separate Mocking Source.

The page always exposes the following public observations:

- the selected source text and source-selection decision;
- verification status and structured diagnostics;
- effective-model origins (`declarado`, `default`, or `derivado`) where they
  explain behavior, without exposing them in HTTP payloads;
- the last client request, HTTP/JSON response, and error incidents;
- the Test Actor, required permissions, granted permissions, and missing
  permissions;
- the current entity state represented as a logical SQLite snapshot;
- conformance vectors and their client/engine comparison;
- the compatibility report keyed by Declaration Identifier.

The prototype will not display reducer state, classes, generated-file layout,
physical SQLite tables, SQL statements, or library-specific diagnostics.

## Guided acceptance cases

Four guided walkthroughs cover the smallest useful cross-section. Free-play
controls expose the same transitions for inspection.

### 1. Valid public journey

1. Load the Semantic Source and optional Mocking Source explicitly.
2. Verify and materialize the effective model, showing declared, default, and
   derived origins.
3. Use the TypeScript-client seam to create a `Proyecto` with whitespace that
   normalizes through `trim`, a valid `Periodo`, an Entity Reference, and an
   exact decimal represented as a string.
4. Show the HTTP/JSON request and response, then the logical SQLite entity
   state.
5. Exercise get, list by offset, list by continuation token, Partial Update
   Message, and delete through the same public boundary.
6. Show that the Partial Update Message returns the complete resulting state
   and that a present `Periodo` is replaced as a whole.

### 2. Contract and boundary rejection

The walkthrough attempts an invalid `Periodo`, an undeclared input field, an
invalid Entity Identifier, a mixed offset/continuation-token request, and an
invalid token. Each produces the existing structured HTTP error shape with
JSON Pointer paths where applicable, and leaves the logical entity state
unchanged.

It also loads a source with a missing reference and a source with an unsupported
function. Verification must stop before the mock or client stage and must not
produce a partial effective model.

### 3. Authorization and Mocking Scenarios

The fixed Test Actors are `editor`, `reader`, and `anonymous`. The simulated
`X-Test-Actor` header is visible. The walkthrough proves default denial,
requirement of every declared permission, and the authorized and denied
`AprobarProyecto` paths.

The Mocking Source demonstrates zero, one, and multiple matching scenarios as
three distinct observable outcomes: not simulated, declared response/error,
and ambiguity.

### 4. Conformance and compatibility

The same input vectors run through separate logical client and engine runners.
The report compares normalized values, validation incidents, exact decimal
values, `Periodo` assertions, and idempotence. A mismatch is visible rather
than silently accepted.

The compatibility report compares two sources without declared versions by
Declaration Identifier. It includes at least an additive response change, a
breaking input or restriction change, and a moved element whose derived route
changes while its Declaration Identifier remains stable. Results use the
approved compatible, potentially incompatible, and incompatible categories.

## Contract rules exercised

- Normalize before validation; absence and `null` remain distinct.
- Preserve cumulative constraints and validate the complete resulting state.
- Keep exact decimals as strings and reject implicit numeric conversion.
- Reject unknown input fields while tolerating additional known-response
  properties.
- Keep permission and API metadata out of payloads.
- Keep source loading explicit and never download an IRI automatically.
- Treat continuation tokens as opaque and reject invalid binding or mixed
  pagination modes.
- Keep Mocking Scenarios stateless and separate from Semantic Sources.

Errors remain observable through the HTTP/JSON contract already recorded for the
project example: status, Problem Details members, and the `errors` extension
with stable codes and field paths. The prototype does not introduce a second
error format.

## Deliberate limits

- No real HTTP server, TypeScript generator/compiler, SHACL runtime, CEL
  runtime, SQLite database, authentication provider, JWE signing, or process
  restart is introduced by this prototype.
- The conformance report demonstrates the vector and reporting seam; it does
  not claim equivalence of production runtimes.
- The walkthroughs are representative acceptance evidence, not an exhaustive
  implementation test suite. The approved specification remains the source
  for the full acceptance table.
- No production ontology, public API, database schema, or implementation
  dependency is selected by the prototype.

## Validation

The guided walkthroughs are the runnable check. Opening the HTML and completing
each walkthrough must make every expected transition and report visible. No
separate test framework, fixture system, or root-level command is added.

## Follow-up

After this disposable prototype is reviewed, the implementation plan must turn
each logical adapter into a real acceptance seam while keeping public
observables stable. The first real implementation acceptance should run the
same cases against the actual Turtle/SHACL verifier, generated TypeScript
client, HTTP/JSON mock, and SQLite persistence.
