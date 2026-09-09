## Agent skills

### Integration workflow

- `main` is the protected integration branch. Before editing files or creating commits, run `git branch --show-current`; if it returns `main`, first create or switch to a work branch (`feature/*`, `fix/*`, `docs/*`, `prototype/*`, or `chore/*`).
- Changes are integrated into `main` through a Pull Request or an equivalent operation performed in GitHub. Do not update the remote with `git push origin main`, and do not locally merge work that will later be published directly to `main`.
- Keep all related commits and changes on the work branch. Before opening a Pull Request, verify `git status --short` and `git diff origin/main...HEAD`.
- If local `main` contains commits that are not yet in `origin/main`, first create a branch pointing at the current commit to preserve them. Reset `main` only after confirming that the working tree is clean and the destination is the expected `origin/main` commit; never use this maintenance to discard unpreserved work.

### Issue tracker

Issues are tracked in this repository's GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository. See `docs/agents/domain.md`.

### Repository language policy

- Canonical repository documentation and human-readable comments, docstrings, and definitive definitions in production source are written in English, using the canonical vocabulary in `CONTEXT.md`.
- New repository communications, including issue and Pull Request text, reviews, comments, and commit messages, are written in English.
- Direct user-facing conversation with the agent remains in Spanish by default. This does not change the language of repository artifacts.
- The in-scope corpus is tracked, human-authored documentation outside prototype directories: root guidance, the domain glossary, ADRs, agent and process guidance, research, specifications, designs, implementation plans, samples, and equivalent Markdown or text documentation added later. Production source documentation outside prototype directories is also in scope.
- The current inventory is `AGENTS.md`, `CONTEXT.md`, `docs/adr/*.md`, `docs/agents/*.md`, `docs/research/*.md`, `docs/specification.md`, `docs/superpowers/plans/*.md`, `docs/superpowers/specs/*.md`, and `samples/*.md`. New files matching the same categories join the inventory automatically.
- All content under `prototypes/` is excluded, including READMEs, source files, fixtures, reports, generated evidence, dependencies, and launch instructions. Historical GitHub issues, comments, reviews, and other already-published repository communication are also excluded.
- Do not rename or reinterpret protected contract surfaces: code-facing identifiers, RDF IRIs, JSON keys, public API names and routes, runtime payload fields, protocol literals, declaration identifiers, serialized data, command-line syntax, and exact example values whose spelling carries contract meaning.
- Preserve existing paths, filenames, ADR numbering, links, headings, anchors, examples, and cross-references unless a separate decision authorizes a change. The migration is documentation-only except for explicitly in-scope production comments or docstrings.

#### Documentation review checklist

- Confirm that the file is in scope and is outside `prototypes/`, generated content, and historical repository communication.
- Confirm that human-readable prose uses English and the canonical domain terms.
- Confirm that protected contract surfaces, code blocks, serialized examples, and command syntax are unchanged in meaning.
- Confirm that links, headings, anchors, ADR numbering, examples, and cross-references still resolve.
- Confirm that the diff contains no runtime, generated, prototype, or unrelated changes.

## Prototypes

Prototypes are disposable: creating, testing, or removing one must not affect any other part of the repository.

- Place each prototype in its own `prototypes/<name>/` subdirectory.
- Each prototype must have its own `.gitignore`; keep its dependencies, configuration, scripts, tests, and artifacts inside that directory.
- To run or test it, enter its directory first. Keep execution instructions and commands there.
- Do not add prototype-specific recipes, scripts, or commands to the root, including shortcuts that delegate execution to the prototype directory.
- Do not create references or dependencies between prototypes.
- Production code and tests elsewhere in the repository must not reference, import, or depend on prototypes, or use their data or utilities.
- Keep prototypes outside the repository's general build, test, and command flows, so removing any prototype directory does not require changes outside it.
