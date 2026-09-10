# Bounded CEL profile for the first delivery

Decision approved by the user on September 6, 2026. Its incorporation is subject to Pull Request review; [Evaluate a portable CEL profile for the contract layer](https://github.com/TalbyAI/talby-domain/issues/3) will be closed when that Pull Request is merged.

## Decision and scope

Adopt a bounded CEL profile for contract-layer assertions in the first delivery, with explicit host types and comparators and **RE2JS for patterns in TypeScript**. Required equivalence applies to this profile, not to full CEL or to every implementation of the language.

The basis remains [Decide lexical forms and the initial function catalog](https://github.com/TalbyAI/talby-domain/issues/2#issuecomment-5558105986), together with its normative appendix. The cumulative constraints from [model composition](0004-restricciones-acumulativas.md) are not weakened.

WASM is allowed as a candidate but is not a client requirement. The evaluated RE2-WASM package is rejected for this use without adaptation because of its CSP and packaging failures. This does not reject WebAssembly in general. Go was an independent comparison engine; the production engine stack is not selected here, and CEL is not adopted definitively for other deliveries or layers.

## Host responsibilities

CEL provides parsing, signature checking, and expression composition/evaluation. Exact decimal, civil date, profile instant, canonicalization, comparators, and structural validation are host responsibilities, with equivalent results between engine and client.

The effective order is: structure, types, and presence; declared normalizers in order; intrinsic canonicalization; cumulative constraints; assertions whose fields have valid values. Absence and null are distinct. An invalid field does not feed dependent rules, but it does not prevent reporting independent errors. The host preserves incident paths and distinguishes assertion failure (`false`) from evaluation error.

Exact decimal does not pass through number/double. A civil date is not interpreted in a time zone. Instants use UTC with millisecond precision; any input that would lose precision during conversion is rejected without rounding. Evaluation does not consult the clock, network, or locale.

## Supported expressions

- bool, null, string, and int literals; access to fields in a declared environment; `has`; negation, conjunction/disjunction, and compatible scalar comparisons. An assertion must produce bool.
- Explicit host-catalog functions for types, comparators, and patterns. Prototype instrumentation names do not fix public signatures or RDF names.
- The model verifier checks paths and declares their effective types. A dynamic map used to represent presence does not replace that verification.
- Decimal, date, and instant are compared through their typed comparators, including equality. Direct equality between these opaque types is rejected: cel-go accepts it, while the evaluated TypeScript candidate rejects it.
- General arithmetic, double/uint, implicit conversions, native matches/timestamp, comprehensions, macros other than `has`, collection literals, indexes, and conditionals are excluded. Collections, membership, cardinality, and other catalog constraints remain host responsibilities.

Unknown functions, incompatible types, excluded syntax, and non-boolean assertions are rejected while verifying the model. Declared patterns are also checked and compiled in that phase; a library accepting a pattern is not enough to admit it into the profile.

## Patterns and operational limits

The pattern subset from the lexical decision is retained, with full matching, case sensitivity, and Unicode scalar-value semantics. A final line break matches only when explicitly included in the pattern: `a`/`a\n` and `^a$`/`a\n` are false; `^a\n$`/`a\n` is true. The profile parser rejects excluded syntax before delegating to RE2JS or the equivalent server engine.

The following limits are part of the effective profile and are equal in client and engine. They are per-operation resource limits, not business constraints. Exceeding them produces an explicit rejection without truncation or silent changes.

| Resource | Limit |
| --- | --- |
| Lexical digits of a decimal | 4096, following the earlier decision |
| Temporal fraction digits | 4096, following the earlier decision |
| Pattern source | 4096 Unicode scalar values, including optional anchors |
| Nested pattern groups | 32 |
| Individual counted repetition | 0–1000, following the lexical profile |
| Product of nested counted repetitions | 1000 |
| Estimated expanded structural pattern cost | 8192 units |
| Input to one pattern evaluation | 65 536 Unicode scalar values |
| CEL source | 65 536 Unicode scalar values |
| CEL AST | 1024 nodes and depth 64 |
| Nested parentheses/unary prefixes in CEL source | 64 |

Pattern cost is defined as follows: literal/class = 1; alternation = 1; group = interior + 1; ?, *, and + add 1; finite repetition multiplies by max(1,m); `{n,}` multiplies by n+1; concatenation adds. It does not represent bytes or actual engine instructions. The repetition product avoids a hidden limit in the Go parser; checking CEL source complements AST checking because parsers simplify differently.

RE2JS and Go regexp avoid exponential backtracking through their algorithms. Adversarial cases check integration; by themselves they do not demonstrate an asymptotic bound or guarantee constant latency. The total request budget, number of rules, and general payload limits remain in the corresponding technical contract.

## Results and evidence

Reproducible evidence is preserved outside `main` in commit [2285a58 of the portable CEL prototype](https://github.com/TalbyAI/talby-domain/tree/2285a58bd9c23c4778c1ed81de9f4821685de3f1/prototypes/cel-portable). The [experiment report](https://github.com/TalbyAI/talby-domain/blob/2285a58bd9c23c4778c1ed81de9f4821685de3f1/prototypes/cel-portable/README.md) preserves versions, commands, scope, and evidence for both candidates. This decision takes precedence over the proposal state recorded in that historical asset.

**The 217 shared cases match the expected results in TypeScript/Node, cel-go, and Chrome.** They include exact decimal, precision/scale, calendar and offsets, 4096/4097 limits, trim/idempotence, required/nullable, Unicode, JSON types, identifiers, cumulative constraints, enumerations, unknown fields, independent errors, nested `Periodo`, pattern and expression syntax and limits.

| Candidate tested | Browser result |
| --- | --- |
| CEL + RE2JS | 217 cases pass in Chrome 152 with `script-src 'self'`, without WASM/eval or external requests; test Worker is 98 131 bytes gzipped |
| CEL + RE2-WASM 1.0.2 | Fails with `wasm-unsafe-eval` because it uses `new Function`; allowing eval in a negative test also reveals `WrappedRE2 is not a constructor` |

The WASM package was not patched and weakening CSP is not proposed. Tested implementations are cel-js 8.0.0, cel-go 0.26.1, RE2JS 2.8.6, and RE2-WASM 1.0.2; any implementation change must preserve profile conformance.

Observed sizes and timings are experiment results, not commitments about the generated library. Firefox, Safari, mobile devices, all bundlers, and offline operation were not tested. Node ran TypeScript by stripping types; `tsc` was not run.

The host fixture is not an exhaustive verifier for arbitrary declarations. It does not implement an RDF loader, TypeScript generator, HTTP, PATCH, SQLite, the complete reference/cardinality catalog, or exhaustive satisfiability. Implementation acceptance must cover those according to their contracts; this decision resolves feasibility and the expression profile.
