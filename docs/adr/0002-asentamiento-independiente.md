# Asentamiento unidireccional sin el motor original

El asentamiento genera una implementación para un stack concreto que puede usar bibliotecas de runtime especializadas, pero no depende del motor dinámico original. Se acepta una transición unidireccional para permitir la optimización cuando sea necesaria, posponiendo la sincronización bidireccional. El código generado conservará trazabilidad hacia la especificación para explicar su origen y facilitar futuros diffs.
