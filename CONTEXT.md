# Enterprise service language

Project vocabulary for describing and executing services and lowering them to a concrete technology stack.

## Language

**Materialization**:
Transition from a service defined in the DSL to an implementation on a concrete technology stack, independent of the original DSL. It is considered when performance and scalability needs justify it.

**Contract Layer**:
The level that describes the public data model and its structural validation and normalization rules as perceived by a service consumer.

**Data View**:
Grouping of field uses that describes a contract, such as a command, event, or read model, including nested composition of other groupings. It may declare rules that combine multiple field uses.

**Command**:
Specialization of a field grouping with rules, permissions, API configuration, and references to results and errors. It may declare a result or omit one to indicate that it returns no data. Its metadata describes the contract and is not part of the data sent.

**Query**:
Specialized grouping of parameters for a query, with permissions, API configuration, and exactly one declared result.

**Continuation token**:
Opaque value returned by a listing to continue from the last position, bound to its query, filters, and ordering. It is used with a result limit and is not combined with `offset`.

**Read Model**:
Specialized grouping that describes data exposed as a read result, with its metadata and structural rules.

**Event**:
Specialized grouping that describes an occurrence and its data, with its own metadata. Its contract does not require an operation result.

**Module**:
Parentless unit that describes a service and forms its isolation boundary from other services. It may contain entities and features; it is not a root feature.

**Feature**:
Organizational grouping whose parent is a module or another feature and which may contain nested entities and features. Its hierarchy forms the internal namespace and, by default, the public API route.

**Flattened Inclusion**:
Composition that brings the fields of a grouping to the same level as those of the receiving model, preserving its rules and resolving name conflicts through explicit renames.

**Nested Inclusion**:
Composition that brings a grouping in as a named composite field inside the receiving model.

**Default CRUD Operations**:
Declaration on an entity that includes its CRUD operations without requiring every individual command to be described.

**Partial Update Message**:
Input that describes changes to a model: an absent field keeps its previous value. Supplied values and the resulting state preserve the constraints of the complete model.

**Semantic Source**:
RDF data that declares the meaning and contracts of the service according to its semantic ontologies.

**Visual Source**:
RDF data in a separate source and visual ontology that annotates semantic declarations with representation details such as position, size, and color, without changing their meaning, contract compatibility, or execution. In the first-delivery profile, it is scoped to one Module and uses the semantic declaration IRI as the annotation subject.

**Visual Annotation**:
Visual representation metadata attached to one Declaration Identifier in a Visual Source. The first-delivery profile permits one core annotation per declaration and does not introduce a second semantic identity for it.

**Visual Extension**:
Explicit RDF content in a Visual Source that a tool does not interpret but must preserve. A Visual Extension cannot add semantic behavior or trigger execution.

**Mocking Source**:
Optional RDF data that enriches operation simulation according to a mocking ontology. It is selected when the prototype runs.

**Declaration Identifier**:
Stable identity of a specification element, independent of its name and namespace. It allows the same element to be recognized after reorganization and its derived representations to be traced.

**Entity Identifier**:
Required, non-null value that identifies an entity instance, subject to model rules for characters, length, prefix, and suffix, without being tied to a particular generator. Each entity points to one own field use as its identifier. It differs from the declaration identifier that describes its type.

**Field**:
Reusable definition of data, with a default name, type, normalizers, and original constraints. Its name applies to uses that do not declare one of their own.

**Field Use**:
Reusable declaration that adds a field to one or more data views, with an optional name that replaces the default name in those uses. It preserves the field's normalizer sequence without adding local normalizers and may add constraints without replacing or weakening the originals; one field may have multiple uses in the same or different data views.

**Entity Reference**:
Data type whose value identifies an instance of the target entity without embedding its data. It validates the type and format of its identifier; target existence requires an additional business rule.

**Collection**:
Data type that describes an ordered list of elements of a declared type. In partial updates, a supplied collection replaces the complete list.

**Value Type**:
Scalar type defined from a primitive or another value type, preserving its constraints and adding others. Base-type chains are acyclic; an enumeration is a value type with a membership constraint.

**Mocking Scenario**:
Case that selects an operation and input conditions to produce a response, a declared error, or success with no data for a command without a result. It belongs to a mocking source.

**Permission**:
Named grant that an operation may require to allow execution. All declared grants are required; anonymous access is an explicit and exclusive alternative, and omitting both alternatives denies access.

**Declared Business Error**:
Error result that an operation declares it may produce, with a code unique within its module and an optional data view for its details. It differs from engine failures.

**Private Model**:
Extension of the public model, defined in the business layer, with fields and rules not exposed publicly and explicit mappings where the two models differ.

**Business Layer**:
Level that describes data-processing workflows and responses to events from the domain expert's perspective.

**Technical Layer**:
Level that declares service implementation capabilities and options from the architect's or technical leader's perspective.

**Declarative Activity**:
Workflow step defined in the DSL to interact with the service's declared model. Declarative interaction with other services described through the DSL is planned as an extension.

**External Activity**:
Workflow step implemented in code that interacts with an external system from explicit inputs, without directly accessing the main service's state.
_Avoid_: Extensible activity as a term that mixes internal and external operations.

**Defaults**:
Decisions supplied by the system to run a prototype when its specification omits lower-layer details.

**Prototype Profile**:
Explicit set of defaults that allows a partial specification to run while distinguishing demonstration behavior from defined business behavior.

**Test Actor**:
Simulation identity with assigned permissions for checking access to commands and queries in the mock.

**Shared Semantic Model**:
Single specification operated on by visual and textual editing, independent of the graphical layout used to represent it.

### Evolution and governance

**Publication**:
Immutable snapshot of the semantic, visual, mocking, and, when present, governance sources, together with their effective model, offered as a contract to consumers. It versions that set and retains an identifier and fingerprint for each source and the effective model. Those metadata identify and compare snapshots but cannot by themselves reconstruct the source or effective-model contents or the comparison report. It is not equivalent to an individual atomic source change.

**Published Baseline**:
Publication selected as the reference for comparing a candidate source. The report includes every incompatible change from this baseline to the current publication, including intermediate publications. Breaking Change Approval remains linked to this baseline. It may be older than the immediately preceding publication.

**Governance Source**:
Optional source that declares the policies, authorities, and decisions needed to govern a module, separate from its semantic, visual, and mocking sources.

**Inherited Governance**:
Governance that takes another governance source as its base and adds extensions without weakening its rules. Conflicts between the base and extension prevent an effective governance source from being obtained.

**Breaking Change Approval**:
Authenticated and recorded authorization from a user with the corresponding authority to publish incompatible changes, linked to the baseline, candidate source, report, and affected declarations. Approval permits publishing the breaking change but does not classify it as compatible.

**Effective Route**:
Current public route representing a contract operation.

**Superseded Route**:
Former route that continues to respond directly and communicates its successor through `Link: <effective-route-URL>; rel="successor-version"`.

**Redirected Route**:
Former route that remains supported through `308 Permanent Redirect` to the effective route and includes `Location: URL-de-la-ruta-efectiva`, preserving the request method and body.

**Retired Route**:
Route that is no longer supported and responds with `410 Gone`.
