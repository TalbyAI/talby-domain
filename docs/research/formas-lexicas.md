# Lexical forms and initial function catalog

Research and proposed decision, September 6, 2026. Context: [Decide lexical forms and the initial function catalog](https://github.com/TalbyAI/talby-domain/issues/2). This document is a research asset; resolution of that ticket is the canonical decision record. It contains no implementation and does not decide to adopt CEL.

## Basis and outcome

The [specification](../specification.md), [context language](../../CONTEXT.md), [cumulative constraints](../adr/0004-restricciones-acumulativas.md), and [identity independent of namespace](../adr/0005-identidad-independiente-del-namespace.md) were read. The following profile makes its open questions concrete. It preserves strings for decimal, date, instant, and identifier; normalization before constraints; absence distinct from `null`; and rule accumulation.

**Recommendation:** distinguish accepted lexical input, typed value, and canonical output. Decimal and instant have intrinsic canonicalization visible in the effective model; `trim` is optional and declared. The written scale of a decimal is not value information: `1.20` and `1.2` represent the same value. If a future need requires preserving presentation or measured precision, it will need another field or value type.

Everything marked **profile** is a project choice, not a standard requirement. The signatures are abstract behavior contracts, not final RDF names, TypeScript APIs, or CEL syntax.

## What the sources establish

- JSON permits implementation limits on numbers; the integer range interoperable with binary64 is ±9 007 199 254 740 991. Its grammar may admit isolated UTF-16 sequences as escapes, with unpredictable behavior between implementations. This justifies checking integers and text before treating them as contract values. [RFC 8259, numbers](https://www.rfc-editor.org/rfc/rfc8259#section-6), [Unicode](https://www.rfc-editor.org/rfc/rfc8259#section-8.2).
- XSD separates lexical and value spaces. `decimal` does not require floating point; `totalDigits` and `fractionDigits` constrain values, not redundant written zeroes. In XSD 1.1, `totalDigits=t` requires a representation `i/10^n` with `abs(i)<10^t` and `0≤n≤t`; therefore `0.001` requires at least three digits, not one. Its canonical decimal representation omits the point for integer values and retains it for fractional values. The profile's input grammar is more restrictive: it rejects `+1`, `.1`, and `1.`; lexical acceptance and canonicalization are separate decisions. [XSD decimal](https://www.w3.org/TR/xmlschema11-2/#decimal), [totalDigits](https://www.w3.org/TR/xmlschema11-2/#rf-totalDigits), [fractionDigits](https://www.w3.org/TR/xmlschema11-2/#rf-fractionDigits).
- RFC 3339 permits offsets, an optional fraction, and leap seconds under conditions. `-00:00` says that the local offset is unknown even though the UTC time is known. The year uses four digits; the calendar is Gregorian. A profile may restrict these options. [RFC 3339, format and restrictions](https://www.rfc-editor.org/rfc/rfc3339#section-5.6), [unknown offset](https://www.rfc-editor.org/rfc/rfc3339#section-4.3).
- ECMAScript `trim` removes WhiteSpace and LineTerminator at the edges and coerces to text; the catalog here preserves the character set but rejects that coercion. [TrimString](https://tc39.es/ecma262/multipage/text-processing.html#sec-trimstring), [WhiteSpace](https://tc39.es/ecma262/multipage/ecmascript-language-lexical-grammar.html#sec-white-space).
- RE2 does not support backreferences or lookaround; its counted repetitions have a limit of 1000. SHACL `sh:pattern` uses SPARQL expressions and is not automatically equivalent to a payload validator in another engine. An explicit subset avoids confusing these contracts. [RE2 syntax](https://github.com/google/re2/wiki/Syntax), [SHACL pattern](https://www.w3.org/TR/shacl/#PatternConstraintComponent).
- CEL declares `int`, `uint`, and `double` numbers and extension mechanisms. The actual availability of equivalent decimal types and functions is left to the planned prototype and is not inferred from the language. [CEL definition](https://github.com/cel-expr/cel-spec/blob/master/doc/langdef.md#numeric-values).

## Text, boolean, and integer

**Profile:** text is a sequence of Unicode scalar values. Isolated UTF-16 surrogates are rejected at the input boundary; NFC, case folding, and locale-dependent transformation are not applied. Length means the number of scalar values, not bytes, UTF-16 units, or graphemes. `😀` has length one; `e` followed by U+0301 has length two and differs from `é`. The ASCII identifier has the same length in these units.

Boolean accepts only JSON values `true` and `false`. Integer accepts a finite JSON number that is mathematically integral and within the approved range. `1.0` and `1e0` are integers after JSON decoding; `"1"` is not. Numeric negative zero is represented as zero. An adapter receiving a number already rounded by a decoder cannot recover its original spelling; the contract validates the decoded JSON value and does not certify the exactness of the prior numeric lexeme. Data whose lexeme must retain exactness uses decimal as a string.

## Exact decimal

**Input profile**, over the whole string: `-?[0-9]+(\.[0-9]+)?`. Digits are ASCII. Leading and trailing zeroes are accepted for canonicalization. `+`, spaces, exponents, thousands separators, commas, `.5`, `1.`, NaN, and infinity are rejected. A JSON number is never converted to decimal.

**Required canonicalization:** remove leading zeroes from the integer part, leaving one if it becomes empty; remove trailing fractional zeroes; remove the point if no fraction remains; remove `-` when the value is zero. Do not round or pass through `number`/`double`. The output is `0` or a string satisfying the grammar above, without redundant zeroes. For accepted inputs, this canonicalization follows the XSD 1.1 canonical form of `xsd:decimal`; any future RDF mapping must be explicit.

**Value precision and scale:** for the canonical decimal, `s` is the fractional-part length (zero when absent). Let `i` be the integer formed by removing the point and leading zeroes, with one digit for zero. Define `p=max(digits(abs(i)),s,1)`. A declaration `precision=P` requires `p≤P`; `scale=S` requires `s≤S`. This is the XSD 1.1 value-limit semantics, not a requirement to write exactly S decimal places or the capacity of SQL `DECIMAL(P,S)` columns.

`P` is a positive integer and `S` is a non-negative integer; both have a ceiling of 4096 in this profile. Omitting either introduces no business constraint for that parameter. When resolving a declaration or composition, if both limits exist, the effective scale limit is `min(S,P)`; therefore `S>P` is normalized to `P` and not rejected. This normalization is part of the contract and is applied equally by client and engine. When accumulating limits, use the more restrictive one.

**Proposed profile operational limit:** at most 4096 ASCII digits in decimal input, counting redundant zeroes and excluding the sign and point. This is not a domain precision or scale default. Check it before constructing large integers; client and engine apply the same ceiling. Declarations requiring greater capacity are unsupported by this profile and detected during verification. Changing the ceiling requires another explicit effective profile; never truncate. This choice limits resources; it does not derive from sources or promise unlimited exactness. The two limits are independent: declaring `scale=4096` is a permitted maximum, but does not guarantee representing a non-zero value with exactly 4096 fractional places because the required integer zero consumes another lexical digit.

| Input | Canonical | p | s | Note |
| --- | --- | --- | --- | --- |
| `0001.2300` | `1.23` | 3 | 2 | Preserves value |
| `-0.000` | `0` | 1 | 0 | One zero |
| `0.001` | `0.001` | 3 | 3 | Rejects precision=2 |
| `1000.00` | `1000` | 4 | 0 | Presentation zeroes do not count |
| `12.340` | `12.34` | 4 | 2 | Accepts scale=2 |
| `12.345` | `12.345` | 5 | 3 | Rejects scale=2; does not round |
| `9007199254740993.01` | Same | 18 | 2 | Greater precision than number |
| `1e2`, `+1`, `1.`, `.1`, JSON number `1` | Error | — | — | Incorrect format or type |

## Civil date

**Profile:** exactly ten ASCII characters `YYYY-MM-DD`, year 0001–9999, month 01–12, and a valid day in the proleptic Gregorian calendar. A year divisible by 4 is a leap year except for centuries not divisible by 400. Year zero, signed years, ordinal dates, ISO weeks, time, and zone are not accepted. The date is preserved; it is not interpreted as midnight in a zone.

Comparing the tuple `(year,month,day)` or the canonical string gives the same order. `2000-02-29` is valid; `1900-02-29`, `2025-02-29`, `2026-04-31`, `2026-9-06`, and `0000-01-01` are rejected. Do not delegate validation to a parser that adjusts nonexistent days.

## Instant

**Input profile:** a valid date from the previous section, uppercase `T`, time `HH:mm:ss`, an optional `.[0-9]+` fraction, and uppercase `Z` or an offset `+HH:mm` / `-HH:mm`. Hour 00–23, minutes and seconds 00–59; offset from 00:00 to 23:59. Reject `-00:00` so its unknown-offset meaning is not discarded. Lowercase `t`/`z`, a space instead of T, local time without a zone, `24:00:00`, leap seconds, and zone annotations are not accepted.

An input with an offset expresses an instant; subtract that offset and produce exactly `YYYY-MM-DDTHH:mm:ss.sssZ`. Conversion must preserve a UTC year between 0001 and 9999; overflows are rejected. An absent fraction equals `.000`; one or two digits are padded with zeroes. More than three digits is accepted only when **all** digits after the third are zero. Proposed operational ceiling: 4096 fraction digits, checked before processing. Reject precision loss without rounding.

Validate the date/time rule before converting. Do not use the process locale or zone, clock, leap-second calendar, or an external query. Milliseconds can be compared exactly as integers within the profile range; canonical UTC strings can also be compared. Do not compare input strings with different offsets.

| Input | Result |
| --- | --- |
| `2026-09-06T12:34:56+02:00` | `2026-09-06T10:34:56.000Z` |
| `2026-01-01T00:15:00+01:00` | `2025-12-31T23:15:00.000Z` |
| `2026-09-06T00:00:00.12Z` | `2026-09-06T00:00:00.120Z` |
| `2026-09-06T00:00:00.123000Z` | `2026-09-06T00:00:00.123Z` |
| `2026-09-06T00:00:00.123001Z` | Precision error |
| `2016-12-31T23:59:60Z` | Profile-format error |
| `0001-01-01T00:00:00+01:00` | UTC-range error |
| `2026-09-06T00:00:00-00:00` | Unsupported-offset error |

## Entity identifier

**Profile:** a non-empty string consisting exclusively of `[A-Za-z0-9_-]`; inclusive total length, with defaults 1 and 128 resolved when the type is declared. `prefix` is explicit per entity and may be empty; an omitted `suffix` is equivalent to empty. Both use the same alphabet. The value must start/end exactly with them, with case-sensitive comparison.

Prefix and suffix are literal constraints, not regexes; they are not removed when storing or comparing. They may overlap: with prefix `ab` and suffix `bc`, `abc` is valid if it meets the length. No additional length is imposed on a supposed central part. The technical generator may require more space, but that capacity is checked separately. A reference requires the expected entity type and all its identifier constraints; it does not check existence.

`prj_A-1` and `prj_a-1` differ; `prj_á`, spaces, and controls fail. There is no implicit lowercase conversion, ULID, or UUID. A string invalid because of spaces can be recovered only if the model explicitly declares `trim`. RDF declaration identifiers are another concept and are not restricted by this alphabet.

During verification, limits must be integers, minimum≥1, and maximum≥minimum. Prefixes/suffixes incompatible across rules, or no value possible under the maximum, are contradictions; simply adding their lengths is insufficient because they may overlap. An implementation may check satisfiability of both required positions for candidate lengths. No global business maximum is introduced above the maximum selected per entity; payload limits belong to the common technical contract.

## Normalization and absence

**Profile:** `normalize(model,input)` returns a normalized value or incidents. First check structure and JSON types, distinguishing absence, `null`, and a value. For present non-null values, run declared normalizers in order and then type canonicalization. All initial normalizers operate on strings; they do not convert numbers, objects, or booleans. A string is passed through `trim` before parsing decimal/date/instant when that rule is declared.

`trim(s:String) -> String` removes only the following fixed set from both edges, until another character is found:

`U+0009–U+000D, U+0020, U+00A0, U+1680, U+2000–U+200A, U+2028, U+2029, U+202F, U+205F, U+3000, U+FEFF`.

It does not remove U+0085, U+180E, or U+200B; it does not change interior spaces. The table is part of the profile and does not depend on future Unicode runtime tables. Calling `trim(null)` directly is a type error; the pipeline does not call it for `null` or absence. `trim(" \u00A0x\uFEFF")` produces `x`; `trim("x y")` preserves the interior space; a string containing only characters from the set produces empty.

Decimal and instant canonicalization is intrinsic and appears in the effective model after declared text rules. Date and identifier have no other intrinsic transformation. This fixes one order and keeps the type output canonical. The initial catalog permits only `trim` as a configurable normalizer: repetitions and composition with canonicalization are idempotent. Do not assume that future individually idempotent normalizers form an idempotent pipeline; adding them requires demonstrating that composition property.

After normalization, apply all constraints and then the rules between fields that have valid inputs. Do not invent absent values or data defaults. Partial Update Messages retain the approved semantics of replacing groupings and validating the resulting state; this profile does not make required fields optional.

## Signatures and semantics of the initial catalog

`Result<T>` means success with T or a structured error; `Check` means conformance or incidents, not a boolean that confuses incompatibility with failure. The following names are the logical identities of the catalog awaiting materialization. `Decimal`, `Date`, `Instant`, and `EntityId<E>` are typed values represented by strings; `String` is not implicitly accepted where one of them is required.

| Function | Abstract signature | Semantics |
| --- | --- | --- |
| `decimal` | `(String) -> Result<Decimal>` | Grammar, operational limit, and preceding canonicalization |
| `date` | `(String) -> Result<Date>` | Valid date; preserves string |
| `instant` | `(String) -> Result<Instant>` | Exact UTC canonical form and preceding limits |
| `entityId` | `(EntityType, String) -> Result<EntityId<E>>` | Type's effective alphabet and constraints; no existence |
| `trim` | `(String) -> String` | Fixed edge set |
| `required` | `(Presence, Boolean) -> Check` | If true, absence fails; `null` counts as present |
| `nullable` | `(PresentValue, Boolean) -> Check` | If false, `null` fails; does not make a field required |
| `length` | `(String, min?, max?) -> Check` | Number of scalar values; inclusive limits |
| `range` | `(T, lower?, upper?, lowerInclusive=true, upperInclusive=true) -> Check` | T is integer, decimal, date, or instant; endpoints have the same type |
| `precision` | `(Decimal, P) -> Check` | p≤P according to the preceding definition |
| `scale` | `(Decimal, S) -> Check` | s≤S; no padding or rounding |
| `pattern` | `(String, Pattern) -> Check` | Full match using the following subset |
| `oneOf` | `(T, List<T>) -> Check` | Exact membership in a non-empty set of same-type scalars |
| `cardinality` | `(List<T>, min?, max?) -> Check` | Number of elements, including `null` when the element permits it |
| `compareDecimal` | `(Decimal, Decimal) -> -1\|0\|1` | Exact numeric comparison, without number |
| `compareDate` | `(Date, Date) -> -1\|0\|1` | Civil ordering |
| `compareInstant` | `(Instant, Instant) -> -1\|0\|1` | UTC temporal ordering |
| `assert` | `(TypedExpression<Boolean>, FieldPaths) -> Check` | True passes; false produces an incident on declared paths; evaluation error is distinguished |

Parsing functions are explicit in expressions; field adapters apply them for the declared type and show that operation in the effective contract. `length`, `pattern`, and other validators do not canonicalize or coerce. A value with a type/format failure is not supplied to rules that require that type; this avoids false derived incidents without omitting rules for other valid fields.

`oneOf` compares text and identifiers by exact sequence, decimal by canonical value, date by date, and instant by canonical instant. Enumeration literals are checked/canonicalized while verifying the model; duplicates after that process are rejected as a redundant declaration. Lists and objects are not members of enumerations in this profile.

Length/cardinality limits are non-negative integers; numeric/temporal endpoints are validated when declared. A range with no endpoint and length/cardinality with no limits are empty declarations and are rejected. Reject an inverted interval, an open interval reduced to one point, and references to nonexistent fields/functions. The effective set is the conjunction of constraints, never the last written value. Arbitrary expression satisfiability is not promised; detectable structural and limit contradictions are checked.

`required=false` does not cancel an inherited true; `nullable=true` does not cancel an inherited false. Effective minima increase and maxima decrease. Original patterns and expressions remain; enumerations are intersected. Inherited normalizers remain before additions in each use; their order cannot be silently replaced.

General decimal arithmetic is not yet needed to check an amount and `fin>=inicio`: exact comparison and typed constants suffice. Division, rounding, calendars, currency conversion, identifier generation, and external queries are outside the initial catalog. If the prototype finds an acceptance rule requiring them, there will be a new decision about that operation; expression-engine defaults are not inherited.

## Pattern profile

**Choice:** full-string matching, case-sensitive, without flags or locale. Accepted forms are Unicode scalar literals, concatenation, alternation `|`, groups `(...)` and `(?:...)`, positive ASCII character classes with ASCII ranges, and repetitions `?`, `*`, `+`, `{n}`, `{n,m}`, `{n,}`. Counted limits are non-negative integers, no greater than 1000, and satisfy n≤m when both occur; each atom permits at most one quantifier. Metacharacters may be escaped literally; `\n`, `\r`, and `\t` represent those characters. Inside a class, a literal hyphen is escaped or placed first/last; `]` and backslash are escaped.

Reject wildcard `.`, negated classes, `\w`/`\d`/`\s`, Unicode properties, word boundaries, backreferences, lookaround, flags, lazy/possessive quantifiers, and interior anchors. One optional initial `^` and final `$` are allowed as redundant full-match spelling; they do not change semantics. A literal point is written `\.`. The profile parser rejects any syntax not listed before reaching the runtime; it is not enough for an engine to accept the pattern.

Full matching must consume a final line break as well: do not implement it only by adding `$`, whose semantics may allow a match before the line break. Captures are not observable. The operation must work over scalar values and provide execution without exponential backtracking; how to achieve that in TypeScript and the other runtime belongs to the prototype.

The exploratory pattern in `samples/projects.md`, `^([\w-]+)(\.([\w-]+))*$`, is expressed in this profile as `[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*`. This translates the ASCII intent; it does not claim equivalence with every Unicode variant of `\w`. It accepts `uno.dos-3`; rejects `.uno`, `uno..dos`, `uno.`, and `uno\n` (a real line break).

## Conformance cases the prototype must receive

The preceding tables are contract vectors, not executed tests. The prototype must materialize them as shared data and execute at least:

1. Equal success/error and canonical output in client and engine for every decimal, date, instant, and identifier limit; a non-zero digit after the millisecond must fail.
2. `N(N(x))=N(x)` for valid values, including `trim` before decimal/instant, empty strings, and two inclusions of the same grouping. The second step uses the same effective declaration.
3. Out-of-range integer, boolean as string, isolated Unicode surrogate, emoji/combining length, and inclusive/exclusive limits.
4. The four required/nullable combinations for absence, `null`, and value: absence depends only on required; present `null` only on nullable; value follows type rules.
5. Inherited plus added constraints, emptied enumerations, contradictory ranges, and unknown fields. A bad field does not prevent reporting an independent one.
6. `r1=decimal("0.1")` and `r2=decimal("0.10")`; run `compareDecimal(r1.value,r2.value)=0` only if both results succeed. If either is an error, the case produces a parse error and does not invoke `compareDecimal`; also compare values above the safe integer, check `compareDate(fin,inicio)>=0`, and compare different offsets expressing the same instant.
7. Total identifier length 1/128/129 under defaults; prefix/suffix, overlap, and case difference; a correctly formatted reference does not query existence.
8. Pattern with final line break, literal astral Unicode, unsupported syntax, and adversarial input to check the selected execution guarantee.
9. 4096 versus 4097 decimal digits, counting redundant zeroes; temporal fraction with those sizes; neither side applies a smaller secret ceiling.

## What remains for other decisions

The research can close the grammar and semantic choice with this profile if it is adopted in the ticket. No factual question remains that prevents expression evaluation. The 4096 ceiling is a proposed policy that can be revised with prototype evidence, not a measured capability.

The corresponding work remains elsewhere: feasibility of CEL and TypeScript functions/regexes; RDF/shapes names, exported APIs, and stable function diagnostics; incident-route codes and syntax, public error ordering, and general payload limits; exact SQLite storage; and the profile compatibility report. They are not dependencies for specifying these research rules. No implementation is considered verified yet.
