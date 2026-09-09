# Effective-model inspector and derived CRUD design

## Question

What inspectable shape should loading and verifying sources produce, how should declarations be distinguished from defaults, and how should CRUD, Partial Update Messages, permissions, and derived routes be materialized?

## Decision

Create a self-contained logical prototype that prioritizes inspection of the effective model. A person can follow the `source → verify → materialize → inspect` flow and see, for each datum, whether it comes from the source, the Prototype Profile, or a derivation.

The prototype will not run HTTP, SQLite, or real TypeScript generation. Its purpose is to validate the shape of the model and its derived contracts before designing those implementations.

## Artifact shape

The prototype will live in `prototypes/effective-contract-inspector/` and will have:

- a self-contained HTML page that opens directly without installation;
- a minimal README with the run mode;
- its own `.gitignore`, with no dependencies or generated artifacts.

The page will be a thin wrapper around a pure module inside its single `script`. The module will not know about the DOM and will expose transformations over plain data:

`source → verify(source) → materialize(source, profile) → inspect(effectiveModel)`.

## Visible model

The page state will always show:

1. the loaded source;
2. the reached stage (`loaded`, `verified`, or `materialized`);
3. verification diagnostics;
4. the effective model, when verification allows it to be materialized.

Each declaration, default, and derived element will include a visible origin: `declared`, `default`, or `derived`. Each derived operation will show its public route, permissions, input/output contract, and applicable rules.

The example will be a `gestion` module, a `proyectos` feature, and a `Proyecto` entity, with an identifier, a nested `Periodo` grouping, and a decimal amount. The content will be small and representative; it will not attempt to cover the whole language.

## Interaction

Free exploration will offer actions to:

- load the minimum source;
- verify it;
- materialize the effective model;
- load a variant with explicit declarations;
- load an invalid variant;
- reset.

Each action will update the complete state and indicate what changed.

There will be three guided tabs. Each resets to a known state and advances with real buttons:

1. **Explicitly enabled CRUD**: load an entity declaring `crud: true`, verify it, and materialize the five operations: create, get, list, partial update, and delete.
2. **Explicit declaration**: show a declared route and permission override; those values replace the corresponding defaults and the inspector preserves their origin.
3. **Blocking verification**: load a missing reference or contradiction, show the diagnostic, and make clear that no partial effective model is produced.

## Decision evidence

The prototype is satisfactory if it allows the following to be observed without reading code:

- explicitly enabled CRUD derives exactly the five agreed operations;
- a PATCH preserves absent fields, fully replaces a present grouping, and validates the resulting state;
- the rules of a Nested Inclusion remain visible in context;
- an explicit override wins over a default;
- permissions and routes show whether they are declared or derived;
- a missing reference or contradiction blocks materialization;
- no default is confused with declared behavior.

## Limits

The prototype will not include persistence, networking, a server, dependencies, client generation, source comparison, or separate tests. The HTML must remain a disposable asset isolated from production code.
