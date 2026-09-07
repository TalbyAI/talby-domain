package main

import (
	"github.com/google/cel-go/common/ast"
	"strings"
)

func allowedExpression(tree *ast.AST) bool {
	allowed := "|instant|instantCanon|trim|decimalScale|decimalPrecision|compareInstant|decimal|date|canon|compareDecimal|compareDate|fullMatch|_&&_|_||_|!_|-_ |_==_|_!=_|_<_ |_<=_|_>_|_>=_|"
	allowed = strings.ReplaceAll(allowed, " ", "")
	count := 0
	var visit func(ast.Expr, int) bool
	visit = func(e ast.Expr, depth int) bool {
		count++
		if count > 1024 || depth > 64 {
			return false
		}
		switch e.Kind() {
		case ast.CallKind:
			call := e.AsCall()
			if call.IsMemberFunction() || !strings.Contains(allowed, "|"+call.FunctionName()+"|") {
				return false
			}
			for _, a := range call.Args() {
				if call.FunctionName() == "_==_" || call.FunctionName() == "_!=_" {
					name := tree.GetType(a.ID()).TypeName()
					if name == "Decimal" || name == "CivilDate" || name == "Instant" {
						return false
					}
				}
				if !visit(a, depth+1) {
					return false
				}
			}
			return true
		case ast.SelectKind:
			return visit(e.AsSelect().Operand(), depth+1)
		case ast.IdentKind:
			return e.AsIdent() == "m"
		case ast.LiteralKind:
			switch e.AsLiteral().Type().TypeName() {
			case "int", "string", "bool", "null_type":
				return true
			}
			return false
		default:
			return false
		}
	}
	return visit(tree.Expr(), 0)
}

func allowedSource(source string) bool {
	quote := rune(0)
	escaped := false
	prefix, depth := 0, 0
	for _, c := range source {
		if quote != 0 {
			if escaped {
				escaped = false
			} else if c == '\\' {
				escaped = true
			} else if c == quote {
				quote = 0
			}
			continue
		}
		if c == '"' || c == '\'' {
			quote = c
			prefix = 0
			continue
		}
		if c == '!' || c == '-' {
			prefix++
		} else if c != ' ' && c != '\t' && c != '\n' && c != '\r' {
			prefix = 0
		}
		if c == '(' {
			depth++
		}
		if c == ')' {
			depth--
		}
		if prefix > 64 || depth > 64 {
			return false
		}
	}
	return true
}
