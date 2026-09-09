# Cumulative constraints when composing models

A command or model that reuses a field preserves all of its constraints and may only add constraints that combine with them. Overriding or weakening constraints is rejected so that the field keeps the same meaning across its uses.

The first iteration permits only Nested Inclusion through a named field, preserving each grouping's rules. Flattened Inclusion is deferred to simplify composition and validation. Partial Update Messages are distinguished from complete models and do not weaken the constraints of the resulting state.
