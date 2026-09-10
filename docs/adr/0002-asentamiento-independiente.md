# One-way materialization without the original engine

Materialization produces an implementation for a concrete stack that may use specialized runtime libraries, but it does not depend on the original dynamic engine. A one-way transition is accepted to allow optimization when needed, while deferring bidirectional synchronization. Generated code will retain traceability to the specification so that its origin can be explained and future diffs can be made easier.
