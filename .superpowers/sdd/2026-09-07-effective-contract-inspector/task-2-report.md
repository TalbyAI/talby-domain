# Informe Task 2

## Estado

Implementado.

## Cambios

- Añadido `prototypeProfile` congelado con los valores requeridos.
- Añadidos los fixtures `valid`, `explicit` e `invalid` mediante `sourceFixture(variant)` y `loadSource(variant)`.
- Añadida `verifySource(source)` con diagnósticos públicos para padres, referencias y declaraciones contradictorias.
- Añadidas las transformaciones `declarationMap`, `routeFor`, `permissionFor` y `crudOperations`.
- Añadida `materialize(source, profile)`, que solo materializa tras una verificación válida.
- La capa permanece en el único `<script>` de la página y no referencia `document`, DOM ni manejadores.

## Comprobación

Ejecutada la aserción manual equivalente al brief en Node, evaluando únicamente el script de la página:

```text
verifySource(loadSource("valid")).ok === true
materialize(loadSource("valid"), prototypeProfile).effective.operations.length === 5
materialize(loadSource("invalid"), prototypeProfile).effective === null
```

Resultado: `true, true, true`.

También ejecutado `git diff --check` sin errores y confirmado árbol de trabajo limpio tras el commit.

## Commit

`1e3993f prototype: derive effective contract model`

## Concerns

Ninguno dentro del alcance de Task 2. No se añadió suite de pruebas ni dependencia, conforme al brief.
