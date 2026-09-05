# Actividades declarativas sobre el modelo y código para efectos externos

Los workflows y las actividades que operan sobre el modelo del servicio se declaran en el DSL. Las actividades en código se reservan para interacciones con sistemas externos mediante entradas, resultados, errores y efectos explícitos, sin acceso directo al estado del servicio principal. Esta separación conserva la autoridad del modelo en el servicio y evita que las extensiones eludan sus reglas, a cambio de exigir que sus operaciones internas puedan expresarse declarativamente.
