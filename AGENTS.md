## Agent skills

### Flujo de integración

- `main` es la rama de integración protegida. Antes de editar archivos o crear commits, ejecuta `git branch --show-current`; si devuelve `main`, crea o cambia primero a una rama de trabajo (`feature/*`, `fix/*`, `docs/*`, `prototype/*` o `chore/*`).
- Los cambios se integran en `main` mediante un Pull Request o mediante una operación equivalente ejecutada en GitHub. No actualices el remoto con `git push origin main`, ni hagas un merge local que después se publique directamente en `main`.
- Mantén en la rama de trabajo todos los commits y cambios relacionados. Antes de abrir el Pull Request, verifica `git status --short` y `git diff origin/main...HEAD`.
- Si `main` local contiene commits que todavía no están en `origin/main`, crea primero una rama que apunte al commit actual para conservarlos. Restablece `main` solo después de comprobar que el árbol de trabajo está limpio y que el destino es el commit esperado de `origin/main`; nunca uses ese mantenimiento para descartar trabajo no conservado.

### Issue tracker

Issues are tracked in this repository's GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository. See `docs/agents/domain.md`.

## Prototipos

Los prototipos son desechables: crearlos, probarlos o eliminar su carpeta no debe afectar a ninguna otra parte del repositorio.

- Ubicar cada prototipo en su propia subcarpeta `prototypes/<nombre>/`.
- Cada prototipo debe tener su propio `.gitignore`; mantener sus dependencias, configuración, scripts, pruebas y artefactos dentro de su carpeta.
- Para ejecutarlo o probarlo, entrar primero en su carpeta. Mantener allí las instrucciones y los comandos de ejecución.
- No añadir recetas, scripts ni comandos específicos de prototipos en la raíz, incluidos atajos que deleguen la ejecución en su carpeta.
- No crear referencias ni dependencias entre prototipos.
- El código de producción y las pruebas del resto del repositorio no pueden referenciar, importar ni depender de prototipos, ni utilizar sus datos o utilidades.
- Mantener los prototipos fuera de la compilación, las pruebas y los comandos generales del repositorio, de modo que eliminar cualquiera de sus carpetas no requiera cambios fuera de ella.
