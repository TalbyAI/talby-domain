# Enterprise service specification

Status: requirements approved by the user after reviewing the whole set; interview closed. The recorded decisions delimit the first delivery and the planned evolution; they are not yet an executable ontology or an implementation.

## Expected outcome of the first delivery

Define a public contract in RDF/Turtle, check it through SHACL and semantic verification, generate a TypeScript library, and run an HTTP/JSON mock with SQLite. The acceptance case is project management. It includes equivalent normalization and validation between client and engine, test permissions, declarative mocking, and compatibility comparison between sources.

Semantics, visualization, and mocking remain in separate sources with their own ontologies. The first delivery defines the extensible format; building the complete visual editor comes later. For its assertions, adopt the [bounded CEL profile with host types and RE2JS for patterns](adr/0007-perfil-cel-acotado.md), backed by the portability evaluation.

Later detailed design will specify shapes, RDF properties, function signatures, HTTP contracts, and executable tests. Decisions about durable workflows, advanced persistence, migrations, and Materialization remain future direction outside the initial implementation.

## Stated intent

Describe the operation of a DDD bounded context through a DSL, run it as a prototype in a test environment, and evolve it easily. The dynamic engine should allow Materialization to be postponed until very high performance and scalability needs exist.

The “95%” expresses an aspiration for broad coverage, not a numeric threshold. The central case is services that receive external commands or events, apply rules to their data model, and record actions associated with those operations.

## Requested scope

- Data model: value types, validation, normalization, ontology, commands, read models, domain and integration events, queries, permissions, and evolution with explicit compatibility.
- Business processes: workflows, event subscriptions, schedules, and human intervention.
- APIs: public operations and mappings to REST, gRPC, WebSockets, GraphQL, and other protocols.
- Dynamic execution: selectable persistence, with at least CRUD and event sourcing, without excluding other modes; CQRS scope remains to be refined.
- Materialization: implementation independent of the DSL on a concrete stack.

## Existing evidence

`samples/projects.md` explores entities and properties using Turtle notation and the `tdpo` vocabulary, including validation and normalization. Turtle has been selected as the serialization; the example's concrete vocabulary is not yet an approved ontology.

## Authorship and ontologies

Developers, business analysts, and product managers maintain specifications jointly. A visual tool should assist with their visualization, understanding, exploration, and creation.

RDF is adopted as the formal model, Turtle as the common serialization for sources, and SHACL for checking conformance. Start with vocabulary and modular conformance. Any deduction that affects execution must be explicit and visible in the effective model. Concrete shapes remain pending.

Visual and textual editing operate on one Shared Semantic Model with a versionable textual representation. The visual editor must preserve elements it cannot represent. Visual information is stored in a separate source with its own ontology and the same RDF format as semantics. Editing semantic information changes its source; changing location, colors, or other visual details changes the visual source. Graphical layout does not determine behavior.

Execution explicitly selects the semantic files and, optionally, a Mocking Source. References must resolve among the loaded sources and ontologies; finding an IRI does not trigger automatic downloads. Missing references or contradictory declarations prevent the mock from starting.

A third ontology extends the modeling layer to describe operation mocking. Its data forms an additional optional source that can be selected at runtime to simulate commands that need it. The three ontologies describe different aspects; their concrete sources contain service data, visualization, and simulations.

Initial scenarios are selected by operation and input conditions and produce a declared response or error. With no match, the operation is reported as not simulated; multiple matches produce an ambiguity error. CRUD retains its derived behavior with SQLite. Stateful scenarios are deferred to a later extension.

The requested minimum vocabulary includes primitive types, module, feature, entity, field, field group, validation rules, and normalization rules. It must also cover the already agreed concepts: commands, events, read models, queries, value types, references, and collections. `Command` is defined as a specialization of `FieldGroup`.

## Three abstraction layers

The following names identify the layers described by the user; they do not fix DSL keywords.

1. Contract Layer: public data model, structural validation, and normalization from the service consumer's perspective.
2. Business Layer: data-processing workflows, responses to events, and behavior from the domain expert's perspective.
3. Technical Layer: implementation capabilities and decisions from the architect's or technical leader's perspective.

It must be possible to obtain a first prototype by defining only the first layer, generate a client library, and produce mocks for integration tests or front-end development. The engine may provide a demonstration API that stores data in SQLite without yet implementing business logic.

An explicit Prototype Profile is accepted, with basic operations and defined test access. Its versioning, like the rest of the versioning system, is deferred until product version 1.0. The tool must show which behavior comes from defaults and which business rules are missing.

The Business Layer adds semantic conditions and the Technical Layer implements declared guarantees. Contradictions must be detected during declaration, verification, or execution without silently changing behavior. SHACL checks specification structure; verification checks supported references, types, and functions; execution validates normalized data.

## Public-model composition

Fields are described with their normalization and validation rules, and views group fields to represent commands, events, read models, and other contracts. Input models accept additional rules that combine multiple fields. Commands may be composed from individual fields and field groupings. Integration commands and events may also be declared.

`Command` is a specialization of `FieldGroup`: it directly declares fields and rules, plus permissions, API configuration, and references to results and errors. It may contain other groupings through nested fields. An additional input-group declaration is not required. Permission and API metadata are not part of the data sent.

`Query` is a specialized parameter grouping with permissions, API configuration, and an associated result. `ReadModel` and event types are specialized groupings with their own metadata. An event describes an occurrence and its data and does not require an operation result like a command or query.

Every command or model that uses a field includes all of its constraints. It may only add constraints that combine with the originals; it may never weaken them. A complete model is distinguished from a Partial Update Message: in the latter, absence means no change, present values retain their constraints, and the resulting state satisfies every rule. This does not make the original fields optional.

In the first iteration, groupings are included only as Nested Inclusions, through a composite field with an explicit name. The grouping and its cross-field rules are preserved and applied independently to each inclusion. Flattened Inclusion is outside this iteration to simplify preserving those rules. If added later, it will require explicit renames to resolve conflicts and will preserve rule references within each inclusion.

In a Partial Update Message, a present grouping is replaced completely and an absent grouping remains intact. The supplied grouping retains its own validations and must satisfy the global validations of the containing command. Recursive partial updates inside the grouping are not allowed in this iteration.

An entity may explicitly declare that it has Default CRUD Operations; in that case its operations exist without describing commands one by one. CRUD is not enabled by default. When enabled, it derives create, get by identifier, list with pagination, partial update, and delete. The identifier must be declared. During update, absent fields remain intact and the resulting state is validated. Derived operations must be inspectable as explicit contracts. Their interaction with explicit views and the details of responses and errors will be specified in the derived-contract design.

### Effective-model prototype outcome

Status: conclusions confirmed by human review based on the prototype from [issue #5](https://github.com/TalbyAI/talby-domain/issues/5). The [historical, non-normative disposable inspector](../prototypes/effective-contract-inspector/) provides evidence for this form of materialization:

- The visible flow is `source → verification → materialization → inspection`; a source with missing references or contradictory declarations does not produce a partial effective model.
- Each element distinguishes its origin (`declared`, `default`, or `derived`) as internal metadata of the effective model, not as part of the public HTTP payload. An explicit value replaces a default and retains that origin on the route, permissions, and CRUD contracts.
- Explicitly enabled CRUD materializes exactly create, get, list, partial update, and delete, each with an inspectable input and output contract. No entity is enabled automatically.
- A Partial Update Message preserves absent fields, completely replaces a present grouping, and validates the complete state; recursive PATCH inside the grouping is not supported in this iteration.
- Nested Inclusions preserve their fields and rules in context, including `Periodo.fin >= Periodo.inicio`; the decimal amount is treated as exact decimal.

The route is derived from the module/feature/entity hierarchy and permits an explicit override; CRUD permissions are derived per operation and permit an explicit override. Stability of derived permissions when a declaration's name or location changes remains pending.

As future direction, outside the first iteration, a general definition-template or plugin mechanism will be recorded. It may receive semantic, visual, business, or technical models and produce definitions in the same area or in dependent areas, always downward; it may never produce information in an area above its inputs. The ticket must question and specify the whole mechanism without assuming prior deep research or a complete hierarchy among areas.

These conclusions fix the effective-model shape for the first iteration but do not yet resolve RDF shapes, executable signatures, detailed HTTP mapping, SQLite, or TypeScript generation.

Lists must support both `offset + limit` and `continuationToken + limit`. The default limit is 20 and the maximum is 100, with stable ordering by identifier. Each list declares its supported modes and one default; derived CRUD lists support both. The request selects a mode and mixing `offset` and token is rejected.

The continuation token is opaque and bound to the query, its filters, and ordering. An invalid token produces an explicit error. The prototype continues from the last position without guaranteeing an immutable snapshot of data between pages. A snapshot guarantee may be added later as a technical capability. Token encoding and the concrete mode-selection mechanism will be specified in the HTTP contract.

Collections are ordered lists and are replaced completely during update. Entity references validate identifier type and format; checking target existence is an additional business rule.

The service is described as a parentless module; a module is not a feature. A feature has a module or another feature as its parent. An entity belongs to a module or feature. Multiple nesting levels are allowed. The module forms the isolation boundary from other services; features only organize and do not create transaction or deployment boundaries.

Declared elements retain stable identifiers separate from their names and location. The namespace organizes their representation in the API and client libraries. The hierarchy forms the internal namespace and the default public API route unless explicitly configured. Reorganization may change public routes while preserving element identity. References between features resolve by identifier among loaded sources.

Value types, entities with identity, typed references, and collections with cardinality are distinguished. The mock stores included values and represents references by identifiers without assuming automatic loads or cascading deletes. The identity of a stored entity and the stable identifier of its declaration are different concepts.

The initial catalog includes text, boolean, integer, exact decimal, date, temporal instant, and identifier, as well as enumerations and restricted value types. UUID is not imposed as an identifier format.

The first HTTP/JSON and TypeScript profile uses these representations:

| Type | Representation |
| --- | --- |
| Text, identifier, enumeration | String. |
| Boolean | Boolean. |
| Integer | Integer number from −9 007 199 254 740 991 to +9 007 199 254 740 991. |
| Exact decimal | Decimal string, without implicit conversion to `number`. |
| Date | `YYYY-MM-DD` string. |
| Instant | UTC string with `Z` and millisecond precision. |

Decimals are represented as strings without exponents, with declarable precision and scale limits and without implicit rounding. Instants are normalized to UTC, and precision greater than milliseconds is rejected when it cannot be preserved exactly. Dates must represent valid days. Exact lexical forms will be specified in the prototype function contracts.

Each entity model configures the prefix of its identifier. The format rule permits prefixes and suffixes and only the ASCII characters `A-Z`, `a-z`, `0-9`, `-`, and `_`, rejecting spaces and control characters. Length is configurable per entity, with a default of 1–128 characters including prefix and suffix. Comparison is case-sensitive; values are not automatically modified except through explicit normalization. Defaults are resolved when the identifier type is declared; uses retain the resulting constraints without weakening them.

The Technical Layer chooses how identifiers are generated and must satisfy every model rule. Prefixed ULID is a preferred option for the prototype, not a required contract format. The prefix is explicit and stable, independent of the namespace.

The first layer defines only the public model. The business layer may extend it with private fields and rules. The Private Model is treated as an extension of the public model, with mappings declared where they differ. Private data must not be exposed by that extension.

## Normalization and validation

The ontology contains a set of normalization and validation rules. Normalize first and validate afterward: for example, apply `trim` and then check maximum length and a regular expression.

The minimum catalog includes requiredness, acceptance of `null`, length, range, pattern, enumeration membership, cardinality, and cross-field expressions. `trim` is the first normalizer. The catalog will grow according to real cases.

Normalizers run in declared order over compatible values. An incompatibility produces a structured error rather than an implicit conversion. Normalized values and cross-field rules are validated afterward. Requiredness and acceptance of `null` are distinct properties; absence and `null` are not confused.

Unknown fields are rejected in input JSON payloads. The client tolerates additional properties in responses and validates the fields it knows. The mock must check that its responses satisfy the declared contract. This payload policy does not decide how extension vocabularies are preserved in RDF documents.

There must be a simple-to-write expression language. The rule catalog will grow according to expressiveness needs. For the first delivery, adopt the [bounded CEL profile](adr/0007-perfil-cel-acotado.md): explicit host types and comparators for exact decimal, date, and instant, and RE2JS for patterns in TypeScript. Decimal is not converted to `double`; opaque types are compared through their comparators, including equality. The verifier rejects functions, types, and syntax outside the profile before execution. Its operational limits are explicit and equal in client and engine. Evaluation does not select the engine stack or adopt CEL for future layers or deliveries.

The complete normalization pipeline must be deterministic and idempotent: `N(N(x)) = N(x)`. It does not depend on the clock, randomness, or external queries. Shared cases must check this property for the complete pipeline as well as equivalence between runtimes.

Basic functions will have specified semantics and implementations in the runtimes. Compound rules will be expressed over those functions. An unknown function must be detected during verification and never ignored. SHACL checks the declaration; the executor applies the defined behavior.

## Permissions and client library

The first delivery declares named permissions per command or query and allows assigning them to Test Actors to evaluate access in the mock. Access is denied by default and all listed permissions are required. Anonymous access requires an explicit declaration. CRUD derives permissions per operation; the demonstration profile provides a test actor with those permissions assigned and clearly shows the grants. Policies dependent on business state belong to the second layer. The concrete actor-selection mechanism belongs to executor design.

The TypeScript library includes types, HTTP calls, and explicit normalization and validation functions using the same rules as the engine. The server still verifies every input. Shared cases must check client/engine equivalence and normalization idempotence.

## Errors

The engine, mock, and client library share an error contract with a stable code, message, and list of incidents. Each validation incident identifies the rule and paths of affected fields; a cross-field rule may identify several. Validation categories, Declared Business Errors, and technical failures are distinguished within the same contract. HTTP mapping and exact path syntax remain pending.

## Prototype HTTP conventions

Routes are derived from module, features, and declared name, with an explicit override. CRUD uses `POST` to create, `GET` to get or list, `PATCH` for partial update, and `DELETE` to delete. Custom commands and queries use `POST` under `/commands/{nombre}` and `/queries/{nombre}`, respectively, within their module and feature route.

Results are the JSON of the declared model, without an additional wrapper except for lists and errors. Concrete status codes and wrapper property names will be defined in HTTP contracts during detailed design.

## Workflows and extensions

The workflow and activities that interact with the service model are declared in the DSL. Declarative activities have an explicit transaction boundary: their changes commit together or none do. An operation crossing boundaries is expressed as multiple steps. The persistence mode must be checked against the declared boundary; how to define that boundary remains pending.

Activities in code are reserved for interactions with external systems, such as payments or email. They receive clear, defined inputs, return results or errors, and declare external effects. They do not directly access the main service state, which retains authority over its data.

The engine interprets the declaration and interacts with simple services that execute those external activities. The workflow engine must be durable and resilient, using Temporal as a behavior reference without yet deciding on a dependency on that product. It will have automatic retries and declarative configuration for each step's behavior. Transport, concrete retry policies, handling of uncertain external results, and compensation remain pending.

Declarative interaction with other services described through the DSL is planned but is not a primary goal of the first iteration.

Cross-checked reference: Temporal documents [configurable activity retries](https://docs.temporal.io/encyclopedia/retry-policies), but [idempotence of external effects](https://temporal.io/blog/idempotency-and-durable-execution) requires specific treatment. Therefore, the request for durability and retries does not yet resolve DSL policy for a payment confirmed by the provider whose response is lost. This decision is reserved for workflow delivery.

## Persistence and prototype evolution

Persistence selection could be a technical annotation. The intention is to start with CRUD to check the service surface and later specify event sourcing. Some technical changes may require persisted state to be reset. Migration tools between persistence variants are deferred; automatic data preservation when changing modes is not promised.

Final generation must honor the mode declared in the DSL. Expression of transaction boundaries, concurrency, projections, and observable guarantees between modes remain pending.

## Materialization and traceability

A tool will generate optimized code for a concrete stack, able to execute SQL and independent of the original dynamic engine. It may depend on runtime libraries created to optimize this type of application.

Materialization is one-way within the current scope. Generated code must include enough traceability to identify and explain its origin in the specification.

The aim is to support future diffs and updates with greater confidence and potentially synchronize in either direction. That future synchronization is not a required capability in this version.

## Public-contract compatibility

The first delivery retains a compatibility report between an earlier source and a new one without requiring declared versions or implementing version management. It will compare accepted inputs, outputs, and routes, classifying changes as compatible, incompatible, or pending review when it cannot determine the result. It remains separate from persistence migrations.

The author's declaration does not hide detected incompatibilities. Preserving a declaration identifier allows moves or renames to be recognized, but does not make a route or contract change compatible. Concrete comparison rules and treatment of normalization changes remain pending.

Future design anticipates explicit versions for the module, ontologies, functions, and defaults profile, as well as selection of loaded sources; visual and mocking sources will indicate which semantic version they correspond to. Implementing this versioning system is not required before product version 1.0. Selecting semantic and mocking sources remains necessary to run the current prototype.

## Agreed first delivery

Correctly define the public-layer DSL to reach a useful first objective: public contract → normalization and validation → generated client library → SQLite mock, using an example service.

The overall vision retains the three layers, workflows, external activities, persistence modes, visual editor, and Materialization. Implementing them is not required for this first delivery. The current work is to define the specification.

The first transport is HTTP with JSON, the client library is generated for TypeScript, and the mock persists in SQLite. Contracts remain transport-independent. Turtle is used for RDF sources. The CEL profile is fixed in the corresponding ADR; concrete shapes and details of transport and type contracts remain pending.

### Acceptance cases derived from the agreements

These cases describe future checks, not tests already implemented or run.

The example service is project management, starting from the context in `samples/projects.md`, which remains as the original sample. It includes clients and projects, a project-to-client reference, a `Periodo` grouping with `fin >= inicio`, CRUD operations, a simulated `AprobarProyecto` command, a decimal amount, and a declared event to check its contract. Approval workflows do not need to be implemented.

| Case | Required result |
| --- | --- |
| A field with `trim` and minimum length one receives spaces | It normalizes to empty and is rejected with a validation incident. |
| Normalize an already normalized value | The same result is preserved; client and engine agree. |
| A command adds a constraint to a reused field | Both the original and added constraints are applied. |
| An update omits a grouping or supplies it completely | The omitted grouping is preserved; the supplied grouping is replaced and satisfies grouping and command rules. |
| Two Nested Inclusions of the same grouping | Each preserves and applies its rules in its own context. |
| An identifier contains a space, control, or character outside the permitted alphabet | It is rejected; the technical generator must produce model-conforming values. |
| Move an element between features | Its Declaration Identifier is preserved; the report detects the derived-route change. |
| A simulated operation has zero, one, or several matching scenarios | Report not simulated, return a response/error, or report ambiguity, respectively. |
| A declared function is unsupported by the runtime | Verification detects the problem; the function is not ignored. |
| Compare two sources without a declared version | Produce a compatibility report without requiring version management. |
| The client receives an additional response property | It tolerates the additional property and validates known fields. |
| A command receives an undeclared JSON field | It is rejected with a structured error. |
| An actor lacks one of the required permissions | Access is denied even if it has the others. |
| Demo runs derived CRUD | The test actor has grants visible per operation. |
| A decimal amount passes through client, HTTP, mock, and SQLite | It retains its exact value without implicit conversion through `number`. |
| CEL evaluates `Periodo` and exact-decimal rules | Client and engine produce equivalent results under the adopted profile and typed comparators; unsupported syntax is rejected. |
| A CEL pattern receives input with a final line break | Full matching accepts it only if the pattern explicitly includes that line break. |
| A CEL source, its AST, a pattern, its repetitions, or its input exceeds profile limits | Client and engine explicitly reject the operation without truncation or silent changes. |
| List projects through offset and continuation token | Both modes are available and respect declared limits. |
| A request mixes offset and continuation token | It is rejected with an explicit error. |
| A token does not match the request's query, filters, or ordering | It is rejected; the list is not silently restarted. |
| Source selection contains a missing semantic reference | Verification prevents the mock from starting without trying to download the IRI. |
| An instant would lose precision when expressed in milliseconds | Precision loss is rejected; it is not implicitly rounded. |

## Decision tree

First round resolved: qualitative coverage; joint authorship; activity extensions; selectable persistence; one-way Materialization with runtime libraries and traceability.

Second round resolved: public contract with validation and normalization; clients and mocks from the first layer; SQLite demo; explicit Prototype Profile; refinement without silent contradictions; ontologies for vocabulary and modular conformance; internal declarative activities and external activities in code; reset allowed when persistence changes and migrations deferred; Shared Semantic Model for text and visual editor. Profile versioning is deferred in the eighth round.

Third round resolved: reusable fields grouped into views and contracts; cross-field input rules; CRUD enabled per entity; module/feature/entity hierarchy; Private Model as extension with mappings; normalization before validation; explicit transaction boundaries; durable workflows with retries and per-step configuration; first delivery focused on contract, client, and SQLite mock.

Fourth round resolved: cumulative constraints without weakening; parentless module distinct from feature; entities directly in module or feature; hierarchy as namespace and default API route; CRUD with partial update and result validation; simple expression language and extensible catalog; ordered normalizers without implicit conversions and distinction between absence and `null`. Composition is narrowed in the fifth round.

Fifth round resolved: Partial Update Messages distinct from complete models; only Nested Inclusion in the first iteration; rules preserved by inclusion; stable identifiers independent of namespace; value types, entities, references, and collections distinguished; compatibility report from the first delivery.

Sixth round resolved: complete replacement of present groupings with global command validation; RDF and SHACL; separate ontologies and sources for semantics, visualization, and mocking with a shared format; minimum vocabulary declared; HTTP/JSON, TypeScript client, and SQLite; optional Mocking Source selected at runtime. The vocabulary answer does not yet fix the concrete primitive list.

Seventh round: Turtle, the basic catalog with an identifier not limited to UUID, explicit function semantics and implementation, and mocks selected by operation and conditions with explicit response/error, absence, and ambiguity are fixed. Prefixed ULID per entity is preferred as one possible format.

Eighth round resolved: `Command` specializes `FieldGroup`; identifiers with prefix/suffix, alphabet, and length defined by model rules and technical generation; named permissions and Test Actors; client with normalization and validation equivalent to the engine; versioning deferred until product version 1.0.

Ninth round resolved: ASCII identifiers with configurable length and default 1–128, case-sensitive comparison; compatibility between sources without versioning; deterministic and idempotent normalization pipeline; CEL only as an evaluation prototype; common error contract with incidents per rule and field.

Tenth round resolved: initial type representations; rejection of unknown JSON fields in inputs and client tolerance in outputs; access denied by default with all required permissions and an explicit demo actor; queries, read models, and events as specialized groupings; project management as the acceptance example.

Eleventh round resolved: HTTP conventions and results without an additional wrapper except lists/errors; pagination by offset or continuation token with limit; ordered lists and complete replacement; reference existence as a business rule; explicit source loading without IRI downloads; rejection of precision loss; minimum catalog and validation phases. The acceptance of “the rest” was applied to the remaining Q55–Q59 recommendations.

Twelfth round resolved: modes declared per list with one default, CRUD with both modes, request selection without mixing offset and token, opaque token bound to query/filters/order, and explicit error for an invalid token. The prototype does not promise a snapshot between pages.

The requirements interview is closed with the user's approval of the set. The next stage is detailed design for the first delivery: shapes, function signatures, property names, HTTP contracts, and executable cases. These artifacts are not yet implemented or validated.

Factual research on representation, conformance, and expressions is recorded below. RDF, SHACL, and Turtle are selected. After prototype evaluation, the first-delivery CEL profile recorded in the ADR is approved; earlier rounds retain the historical interview state.

Detailed design work: incorporate the evaluated CEL profile; lexical forms and type functions; automatable compatibility-report rules; HTTP contracts and errors; Materialization of pagination modes; complete Turtle example; and executable acceptance tests.

Branches reserved for later deliveries: concurrency and advanced persistence; uncertain external results; durable processes, compensation, and human intervention; projection execution and complex queries; visual editor; operations; conformance between engine and materialized implementation; continuity during Materialization.

## Technical references and pending options

- RDF provides the graph model and Turtle the selected syntax for sources. [W3C Turtle](https://www.w3.org/TR/turtle/).
- SHACL, already selected, validates graphs through shapes. SHACL 1.0 requires graphs to remain immutable during validation; we infer that a pipeline transforming data through normalizers needs additional semantics. It also does not define a mock-scenario executor. [W3C SHACL](https://www.w3.org/TR/shacl/#validation).
- IRIs allow the same elements to be referenced from different sources. RDF does not define automatic document loading by reference; the sources loaded and validated together must be specified. [W3C RDF Concepts](https://www.w3.org/TR/rdf11-concepts/#referents).
- CEL permits expressions checked against an environment of types and functions; it does not define the complete DSL. The adopted profile fixes the extensions and limits needed for the first delivery, with shared evidence across hosts. [CEL overview](https://cel.dev/overview/cel-overview), [language definition](https://github.com/cel-expr/cel-spec/blob/master/doc/langdef.md#extension-functions).
- CEL has no native exact decimal: its standard numbers are `int`, `uint`, and `double`. The adopted profile represents exact decimal, date, and instant through explicit host types and functions, according to the ADR. [Numeric types](https://github.com/cel-expr/cel-spec/blob/master/doc/langdef.md#numeric-values), [abstract types](https://github.com/cel-expr/cel-spec/blob/master/doc/langdef.md#abstract-types).
- ULID encodes 128 bits in 26 characters and permits case-insensitive reading. Validating it also requires checking its range, not only length and alphabet. Per-entity prefixes and normalized textual form would be project conventions beyond the ULID format. [ULID specification](https://github.com/ulid/spec#specification), [overflow](https://github.com/ulid/spec#overflow-errors-when-parsing-base32-strings).
- For binary64 numeric implementations, JSON identifies the integer range ±9 007 199 254 740 991 as interoperable and permits implementation precision limits. The selected profile restricts the initial integer to that range and represents exact decimals as strings. [RFC 8259, section 6](https://www.rfc-editor.org/rfc/rfc8259#section-6).
- RFC 3339 defines complete dates `YYYY-MM-DD` and instants with an offset or `Z`, with an optional fractional second. The selected profile uses UTC output with `Z` and millisecond precision. [RFC 3339, section 5.6](https://www.rfc-editor.org/rfc/rfc3339#section-5.6).
