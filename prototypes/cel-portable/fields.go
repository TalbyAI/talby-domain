package main

import (
	"encoding/json"
	"fmt"
	"github.com/google/cel-go/common/types"
	"github.com/google/cel-go/common/types/ref"
	"math"
	"math/big"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

type fieldSpec struct {
	Name  string           `json:"name"`
	Type  string           `json:"type"`
	Rules []map[string]any `json:"rules"`
}

var idRE = regexp.MustCompile(`\A[A-Za-z0-9_-]+\z`)

const trimChars = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"

func normalize(kind string, v any) (any, error) {
	bad := fmt.Errorf("type-or-format")
	if kind == "integer" {
		n, ok := v.(float64)
		if !ok || math.Trunc(n) != n || math.Abs(n) > 9007199254740991 {
			return nil, bad
		}
		if n == 0 {
			return float64(0), nil
		}
		return n, nil
	}
	if kind == "boolean" {
		if _, ok := v.(bool); !ok {
			return nil, bad
		}
		return v, nil
	}
	s, ok := v.(string)
	if !ok || !utf8.ValidString(s) {
		return nil, bad
	}
	var typed ref.Val
	switch kind {
	case "decimal":
		typed = decimal(types.String(s))
	case "date":
		typed = date(types.String(s))
	case "instant":
		typed = instant(types.String(s))
	case "string":
		return s, nil
	case "id":
		if idRE.MatchString(s) {
			return s, nil
		}
		return nil, bad
	default:
		return nil, bad
	}
	if result, ok := typed.(scalar); ok {
		return result.value, nil
	}
	return nil, bad
}
func order(kind string, a, b any) int {
	if kind == "decimal" {
		x, _ := new(big.Rat).SetString(a.(string))
		y, _ := new(big.Rat).SetString(b.(string))
		return x.Cmp(y)
	}
	if x, ok := a.(float64); ok {
		y := b.(float64)
		if x < y {
			return -1
		}
		if x > y {
			return 1
		}
		return 0
	}
	return strings.Compare(a.(string), b.(string))
}
func wellFormedJSONText(raw []byte) bool {
	for i := 0; i < len(raw); i++ {
		if raw[i] != '\\' {
			continue
		}
		i++
		if i >= len(raw) || raw[i] != 'u' {
			continue
		}
		if i+4 >= len(raw) {
			return false
		}
		n, e := strconv.ParseUint(string(raw[i+1:i+5]), 16, 16)
		if e != nil {
			return false
		}
		i += 4
		if n >= 0xdc00 && n <= 0xdfff {
			return false
		}
		if n < 0xd800 || n > 0xdbff {
			continue
		}
		if i+6 >= len(raw) || raw[i+1] != '\\' || raw[i+2] != 'u' {
			return false
		}
		low, e := strconv.ParseUint(string(raw[i+3:i+7]), 16, 16)
		if e != nil || low < 0xdc00 || low > 0xdfff {
			return false
		}
		i += 6
	}
	return true
}
func validateFields(spec []fieldSpec, raw json.RawMessage, inputOrder []string) map[string]any {
	value := map[string]any{}
	issues := []map[string]string{}
	issue := func(field, rule string) { issues = append(issues, map[string]string{"field": field, "rule": rule}) }
	input := map[string]json.RawMessage{}
	if string(raw) == "null" || json.Unmarshal(raw, &input) != nil {
		return map[string]any{"status": "validation-error", "value": value, "issues": []map[string]string{{"field": "", "rule": "type"}}}
	}
	for _, f := range spec {
		minima, maxima := []any{}, []any{}
		enums := [][]any{}
		lo, hi := float64(0), math.Inf(1)
		for _, r := range f.Rules {
			if f.Type != "string" && f.Type != "id" {
				if _, ok := r["minLength"]; ok {
					return map[string]any{"status": "model-error"}
				}
				if _, ok := r["maxLength"]; ok {
					return map[string]any{"status": "model-error"}
				}
			}
			for _, bound := range []string{"min", "max"} {
				if x, exists := r[bound]; exists {
					v, e := normalize(f.Type, x)
					if e != nil {
						return map[string]any{"status": "model-error"}
					}
					if bound == "min" {
						minima = append(minima, v)
					} else {
						maxima = append(maxima, v)
					}
				}
			}
			if choices, exists := r["oneOf"]; exists {
				values := []any{}
				seen := map[any]bool{}
				for _, x := range choices.([]any) {
					v, e := normalize(f.Type, x)
					if e != nil || seen[v] {
						return map[string]any{"status": "model-error"}
					}
					seen[v] = true
					values = append(values, v)
				}
				if len(values) == 0 {
					return map[string]any{"status": "model-error"}
				}
				enums = append(enums, values)
			}
			if x, ok := r["minLength"].(float64); ok {
				lo = math.Max(lo, x)
			}
			if x, ok := r["maxLength"].(float64); ok {
				hi = math.Min(hi, x)
			}
		}
		for _, a := range minima {
			for _, b := range maxima {
				if order(f.Type, a, b) > 0 {
					return map[string]any{"status": "model-error"}
				}
			}
		}
		if lo > hi {
			return map[string]any{"status": "model-error"}
		}
		if len(enums) > 0 {
			common := false
			for _, v := range enums[0] {
				all := true
				for _, choices := range enums {
					found := false
					for _, x := range choices {
						if x == v {
							found = true
						}
					}
					all = all && found
				}
				common = common || all
			}
			if !common {
				return map[string]any{"status": "model-error"}
			}
		}
	}
	// Match input declaration order for deterministic probe diagnostics.
	keys := inputOrder
	if keys == nil {
		dec := json.NewDecoder(strings.NewReader(string(raw)))
		dec.Token()
		for dec.More() {
			k, _ := dec.Token()
			keys = append(keys, k.(string))
			var ignored json.RawMessage
			dec.Decode(&ignored)
		}
	}
	for _, k := range keys {
		found := false
		for _, f := range spec {
			if f.Name == k {
				found = true
			}
		}
		if !found {
			issue(k, "unknown")
		}
	}
	for _, f := range spec {
		vRaw, present := input[f.Name]
		required, nonNull := false, false
		for _, r := range f.Rules {
			required = required || r["required"] == true
			nonNull = nonNull || r["nullable"] == false
		}
		if !present {
			if required {
				issue(f.Name, "required")
			}
			continue
		}
		var v any
		if json.Unmarshal(vRaw, &v) != nil {
			issue(f.Name, "type-or-format")
			continue
		}
		if v == nil {
			if nonNull {
				issue(f.Name, "nullable")
			} else {
				value[f.Name] = nil
			}
			continue
		}
		if f.Type == "period" {
			nested := []fieldSpec{{"inicio", "date", []map[string]any{{"required": true, "nullable": false}}}, {"fin", "date", []map[string]any{{"required": true, "nullable": false}}}}
			r := validateFields(nested, vRaw, nil)
			for _, e := range r["issues"].([]map[string]string) {
				issue(f.Name+"."+e["field"], e["rule"])
			}
			values := r["value"].(map[string]any)
			if r["status"] == "ok" && values["fin"].(string) < values["inicio"].(string) {
				issue(f.Name+".inicio", "period")
				issue(f.Name+".fin", "period")
			}
			value[f.Name] = values
			continue
		}
		if _, ok := v.(string); ok && !wellFormedJSONText(vRaw) {
			issue(f.Name, "type-or-format")
			continue
		}
		invalid := false
		for _, r := range f.Rules {
			if r["trim"] == true {
				s, ok := v.(string)
				if !ok {
					invalid = true
					break
				}
				v = strings.Trim(s, trimChars)
			}
		}
		var e error
		if !invalid {
			v, e = normalize(f.Type, v)
		}
		if invalid || e != nil {
			issue(f.Name, "type-or-format")
			continue
		}
		value[f.Name] = v
		hasMaxLength := false
		for _, r := range f.Rules {
			if f.Type == "string" || f.Type == "id" {
				if n, ok := r["minLength"].(float64); ok && float64(utf8.RuneCountInString(v.(string))) < n {
					issue(f.Name, "length")
				}
				if n, ok := r["maxLength"].(float64); ok {
					hasMaxLength = true
					if float64(utf8.RuneCountInString(v.(string))) > n {
						issue(f.Name, "length")
					}
				}
			}
			for _, bound := range []string{"min", "max"} {
				if x, exists := r[bound]; exists {
					b, _ := normalize(f.Type, x)
					c := order(f.Type, v, b)
					if bound == "min" && (c < 0 || c == 0 && r["minInclusive"] == false) || bound == "max" && (c > 0 || c == 0 && r["maxInclusive"] == false) {
						issue(f.Name, "range")
					}
				}
			}
			if choices, ok := r["oneOf"].([]any); ok {
				found := false
				for _, x := range choices {
					n, _ := normalize(f.Type, x)
					if n == v {
						found = true
					}
				}
				if !found {
					issue(f.Name, "oneOf")
				}
			}
			if f.Type == "decimal" {
				s := v.(string)
				parts := strings.Split(s, ".")
				scale := 0
				if len(parts) == 2 {
					scale = len(parts[1])
				}
				p := max(len(strings.TrimLeft(strings.NewReplacer("-", "", ".", "").Replace(s), "0")), scale, 1)
				if n, ok := r["precision"].(float64); ok && float64(p) > n {
					issue(f.Name, "precision")
				}
				if n, ok := r["scale"].(float64); ok && float64(scale) > n {
					issue(f.Name, "scale")
				}
			}
			if f.Type == "id" {
				bad := false
				if s, ok := r["prefix"].(string); ok && !strings.HasPrefix(v.(string), s) {
					bad = true
				}
				if s, ok := r["suffix"].(string); ok && !strings.HasSuffix(v.(string), s) {
					bad = true
				}
				if bad {
					issue(f.Name, "identifier")
				}
			}
		}
		if f.Type == "id" && !hasMaxLength && len(v.(string)) > 128 {
			issue(f.Name, "length")
		}
	}
	status := "ok"
	if len(issues) > 0 {
		status = "validation-error"
	}
	return map[string]any{"status": status, "value": value, "issues": issues}
}
