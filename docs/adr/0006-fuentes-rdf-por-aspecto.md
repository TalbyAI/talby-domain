# Fuentes RDF separadas para semántica, visualización y mocking

Se adoptan RDF y SHACL como base formal y de conformidad, con Turtle como serialización común. Semántica, visualización y mocking tienen ontologías propias y fuentes separadas; la herramienta visual consume ese mismo formato y modifica la fuente correspondiente al aspecto editado. Así se evita que la representación gráfica se convierta en una definición paralela del servicio. La fuente de mocking es opcional y se selecciona al ejecutar.
