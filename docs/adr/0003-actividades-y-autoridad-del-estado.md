# Declarative activities over the model and code for external effects

Workflows and activities that operate on the service model are declared in the DSL. Activities in code are reserved for interactions with external systems through explicit inputs, results, errors, and effects, without direct access to the main service state. This separation preserves the model's authority in the service and prevents extensions from bypassing its rules, at the cost of requiring internal operations to be expressible declaratively.
