// PROTOTYPE: independent host implementation, not a contract runtime.
package main

import (
	"encoding/json"
	"fmt"
	"math/big"
	"os"
	"reflect"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/cel-go/cel"
	"github.com/google/cel-go/common/types"
	"github.com/google/cel-go/common/types/ref"
)

type scalar struct{ kind, value string }

func (s scalar) Type() ref.Type { return types.NewOpaqueType(s.kind) }
func (s scalar) Value() any     { return s.value }
func (s scalar) ConvertToNative(t reflect.Type) (any, error) {
	return nil, fmt.Errorf("unsupported conversion")
}
func (s scalar) ConvertToType(t ref.Type) ref.Val {
	if t.TypeName() == s.kind {
		return s
	}
	return types.NewErr("type")
}
func (s scalar) Equal(v ref.Val) ref.Val {
	other, ok := v.(scalar)
	return types.Bool(ok && s == other)
}

var decimalRE = regexp.MustCompile(`\A-?[0-9]+(?:\.[0-9]+)?\z`)
var instantRE = regexp.MustCompile(`\A([0-9]{4}-[0-9]{2}-[0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]+))?(Z|[+-][0-9]{2}:[0-9]{2})\z`)

func instant(v ref.Val) ref.Val {
	s := string(v.(types.String))
	m := instantRE.FindStringSubmatch(s)
	if m == nil {
		return types.NewErr("format")
	}
	if _, ok := date(types.String(m[1])).(scalar); !ok {
		return types.NewErr("format")
	}
	fraction, zone := m[5], m[6]
	if len(fraction) > 4096 {
		return types.NewErr("limit")
	}
	if len(fraction) > 3 && strings.Trim(fraction[3:], "0") != "" {
		return types.NewErr("precision")
	}
	if m[2] > "23" || m[3] > "59" || m[4] > "59" || zone == "-00:00" || (zone != "Z" && (zone[1:3] > "23" || zone[4:] > "59")) {
		return types.NewErr("format")
	}
	fraction = (fraction + "000")[:3]
	t, err := time.Parse(time.RFC3339Nano, m[1]+"T"+m[2]+":"+m[3]+":"+m[4]+"."+fraction+zone)
	if err != nil || t.UTC().Year() < 1 || t.UTC().Year() > 9999 {
		return types.NewErr("range")
	}
	return scalar{"Instant", t.UTC().Format("2006-01-02T15:04:05.000Z")}
}
func decimal(v ref.Val) ref.Val {
	s := string(v.(types.String))
	if !decimalRE.MatchString(s) {
		return types.NewErr("format")
	}
	if len(strings.NewReplacer("-", "", ".", "").Replace(s)) > 4096 {
		return types.NewErr("limit")
	}
	parts := strings.SplitN(strings.TrimPrefix(s, "-"), ".", 2)
	whole := strings.TrimLeft(parts[0], "0")
	if whole == "" {
		whole = "0"
	}
	frac := ""
	if len(parts) == 2 {
		frac = strings.TrimRight(parts[1], "0")
	}
	result := whole
	if frac != "" {
		result += "." + frac
	}
	if strings.HasPrefix(s, "-") && result != "0" {
		result = "-" + result
	}
	return scalar{"Decimal", result}
}
func date(v ref.Val) ref.Val {
	s := string(v.(types.String))
	d, err := time.Parse("2006-01-02", s)
	if err != nil || len(s) != 10 || d.Year() < 1 || d.Format("2006-01-02") != s {
		return types.NewErr("format")
	}
	return scalar{"CivilDate", s}
}
func main() {
	dec, day, inst := cel.OpaqueType("Decimal"), cel.OpaqueType("CivilDate"), cel.OpaqueType("Instant")
	env, err := cel.NewEnv(
		cel.ParserExpressionSizeLimit(65536), cel.ParserRecursionLimit(64),
		cel.Variable("m", cel.MapType(cel.StringType, cel.DynType)),
		cel.Function("instant", cel.Overload("instant_string", []*cel.Type{cel.StringType}, inst, cel.UnaryBinding(instant))),
		cel.Function("instantCanon", cel.Overload("instant_canon", []*cel.Type{inst}, cel.StringType, cel.UnaryBinding(func(v ref.Val) ref.Val { return types.String(v.(scalar).value) }))),
		cel.Function("compareInstant", cel.Overload("compare_instant", []*cel.Type{inst, inst}, cel.IntType, cel.BinaryBinding(func(a, b ref.Val) ref.Val { return types.Int(strings.Compare(a.(scalar).value, b.(scalar).value)) }))),
		cel.Function("trim", cel.Overload("trim_string", []*cel.Type{cel.StringType}, cel.StringType, cel.UnaryBinding(func(v ref.Val) ref.Val {
			return types.String(strings.Trim(string(v.(types.String)), "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"))
		}))),
		cel.Function("decimalScale", cel.Overload("decimal_scale", []*cel.Type{dec}, cel.IntType, cel.UnaryBinding(func(v ref.Val) ref.Val {
			p := strings.Split(v.(scalar).value, ".")
			if len(p) == 1 {
				return types.Int(0)
			}
			return types.Int(len(p[1]))
		}))),
		cel.Function("decimalPrecision", cel.Overload("decimal_precision", []*cel.Type{dec}, cel.IntType, cel.UnaryBinding(func(v ref.Val) ref.Val {
			s := v.(scalar).value
			p := strings.Split(s, ".")
			scale := 0
			if len(p) == 2 {
				scale = len(p[1])
			}
			digits := len(strings.TrimLeft(strings.NewReplacer("-", "", ".", "").Replace(s), "0"))
			return types.Int(max(1, scale, digits))
		}))),
		cel.Function("decimal", cel.Overload("decimal_string", []*cel.Type{cel.StringType}, dec, cel.UnaryBinding(decimal))),
		cel.Function("date", cel.Overload("date_string", []*cel.Type{cel.StringType}, day, cel.UnaryBinding(date))),
		cel.Function("canon", cel.Overload("canon_decimal", []*cel.Type{dec}, cel.StringType, cel.UnaryBinding(func(v ref.Val) ref.Val { return types.String(v.(scalar).value) }))),
		cel.Function("compareDecimal", cel.Overload("compare_decimal", []*cel.Type{dec, dec}, cel.IntType, cel.BinaryBinding(func(a, b ref.Val) ref.Val {
			x, _ := new(big.Rat).SetString(a.(scalar).value)
			y, _ := new(big.Rat).SetString(b.(scalar).value)
			return types.Int(x.Cmp(y))
		}))),
		cel.Function("compareDate", cel.Overload("compare_date", []*cel.Type{day, day}, cel.IntType, cel.BinaryBinding(func(a, b ref.Val) ref.Val { return types.Int(strings.Compare(a.(scalar).value, b.(scalar).value)) }))),
		cel.Function("fullMatch", cel.Overload("full_match", []*cel.Type{cel.StringType, cel.StringType}, cel.BoolType, cel.BinaryBinding(func(a, b ref.Val) ref.Val {
			text := string(a.(types.String))
			if !utf8.ValidString(text) || utf8.RuneCountInString(text) > 65536 {
				return types.NewErr("text-limit-or-unicode")
			}
			compiled, e := pattern(string(b.(types.String)))
			if e != nil {
				return types.NewErr("pattern")
			}
			r, e := regexp.Compile(compiled)
			if e != nil {
				return types.NewErr("pattern")
			}
			return types.Bool(r.MatchString(string(a.(types.String))))
		}))),
	)
	if err != nil {
		panic(err)
	}
	data, err := os.ReadFile("cases.json")
	if err != nil {
		panic(err)
	}
	var cases []struct {
		Name       string          `json:"name"`
		Expression string          `json:"expression"`
		Input      json.RawMessage `json:"input"`
		InputOrder []string        `json:"inputOrder"`
		Fields     []fieldSpec     `json:"fields"`
		Assert     bool            `json:"assert"`
		Expected   map[string]any  `json:"expected"`
	}
	if err = json.Unmarshal(data, &cases); err != nil {
		panic(err)
	}
	results := []map[string]any{}
	failures := 0
	for _, c := range cases {
		actual := map[string]any{"status": "check-error"}
		if c.Fields != nil {
			actual = validateFields(c.Fields, c.Input, c.InputOrder)
			c.Expression = "(host pipeline)"
		} else {
			ast, issues := env.Compile(c.Expression)
			if issues.Err() == nil && allowedSource(c.Expression) && allowedExpression(ast.NativeRep()) && (!c.Assert || ast.OutputType().TypeName() == "bool") {
				p, e := env.Program(ast)
				if e != nil {
					panic(e)
				}
				var input map[string]any
				json.Unmarshal(c.Input, &input)
				v, _, e := p.Eval(input)
				actual = map[string]any{"status": "eval-error"}
				if e == nil {
					actual = map[string]any{"status": "ok", "value": v.Value()}
				}
			}
		}
		raw, _ := json.Marshal(actual)
		var normalized map[string]any
		json.Unmarshal(raw, &normalized)
		if !reflect.DeepEqual(normalized, c.Expected) {
			failures++
			fmt.Printf("FAIL %s: %s\n", c.Name, raw)
		}
		results = append(results, map[string]any{"name": c.Name, "expression": c.Expression, "expected": c.Expected, "actual": actual})
	}
	output, _ := json.MarshalIndent(results, "", "  ")
	os.MkdirAll("results", 0755)
	if err = os.WriteFile("results/go.json", output, 0644); err != nil {
		panic(err)
	}
	if failures > 0 {
		os.Exit(1)
	}
	fmt.Printf("Go: %d checks passed\n", len(cases))
}
