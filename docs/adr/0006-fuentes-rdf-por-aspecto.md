# Separate RDF sources for semantics, visualization, and mocking

RDF and SHACL are adopted as the formal and conformance foundation, with Turtle as the common serialization. Semantics, visualization, and mocking have their own ontologies and separate sources; the visual tool consumes the same format and modifies the source for the edited aspect. This prevents the graphical representation from becoming a parallel definition of the service. The Mocking Source is optional and selected at runtime.
