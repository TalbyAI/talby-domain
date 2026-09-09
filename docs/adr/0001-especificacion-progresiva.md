# Progressive specification in three layers

The specification separates the public data contract, business behavior, and technical decisions, with defaults that allow a prototype to run while defining only the contract. This progression is chosen to explore a service before completing its behavior and implementation, rather than requiring an exhaustive definition at the outset.

Defaults belong to an explicit profile and must be distinguished from defined business behavior; their versioning is deferred until product version 1.0. The business layer adds semantic conditions and the technical layer implements declared guarantees; contradictions must be detected without silently changing behavior. The exact behavior of defaults and the verification phases remain pending.
