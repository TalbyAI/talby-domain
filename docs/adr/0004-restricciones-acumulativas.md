# Restricciones acumulativas al componer modelos

Un comando o modelo que reutiliza un campo conserva todas sus restricciones y solo puede añadir otras que se combinan con ellas. Se descarta sobrescribir o debilitar las restricciones para conservar el significado del campo en sus distintos usos.

La primera iteración solo admite inclusión anidada mediante un campo nombrado, preservando las reglas de cada agrupación. Se aplaza el aplanado para simplificar su composición y validación. Los mensajes de cambios parciales se distinguen de los modelos completos y no debilitan las restricciones del estado resultante.
