package main

import (
	"fmt"
	"strconv"
	"strings"
	"unicode/utf8"
)

// Same proposed ceilings as the TypeScript verifier; independent parser.
func pattern(source string) (result string, err error) {
	defer func() {
		if failure := recover(); failure != nil {
			err = fmt.Errorf("pattern: %v", failure)
		}
	}()
	chars := []rune(source)
	if !utf8.ValidString(source) || len(chars) > 4096 {
		panic("limit-or-unicode")
	}
	i := 0
	at := func() rune {
		if i >= len(chars) {
			return 0
		}
		return chars[i]
	}
	take := func() rune {
		if i >= len(chars) {
			panic("unexpected end")
		}
		c := chars[i]
		i++
		return c
	}
	if at() == '^' {
		i++
	}
	literal := func(c rune) string { return fmt.Sprintf(`\x{%x}`, c) }
	escaped := func() rune {
		c := take()
		switch c {
		case 'n':
			return '\n'
		case 'r':
			return '\r'
		case 't':
			return '\t'
		}
		if !strings.ContainsRune(`\.^$|?*+()[]{}-`, c) {
			panic("escape")
		}
		return c
	}
	type node struct {
		text         string
		cost, repeat int
	}
	var group func(int) node
	group = func(depth int) node {
		if depth > 32 {
			panic("depth")
		}
		var text strings.Builder
		cost, repeat := 0, 1
		for i < len(chars) && at() != ')' && !(at() == '$' && i == len(chars)-1) {
			atom := ""
			size, count := 1, 1
			c := take()
			if c == '|' {
				text.WriteRune(c)
				cost++
				continue
			}
			switch c {
			case '(':
				if at() == '?' && i+1 < len(chars) && chars[i+1] == ':' {
					i += 2
				}
				nested := group(depth + 1)
				if take() != ')' {
					panic("group")
				}
				atom = "(?:" + nested.text + ")"
				size = nested.cost + 1
				count = nested.repeat
			case '[':
				type item struct {
					char    rune
					escaped bool
				}
				items := []item{}
				for i < len(chars) && at() != ']' {
					isEscape := at() == '\\'
					char := take()
					if isEscape {
						char = escaped()
					}
					if char > 127 || (!isEscape && (char == '[' || char == '^' && len(items) == 0)) {
						panic("class")
					}
					items = append(items, item{char, isEscape})
				}
				if take() != ']' || len(items) == 0 {
					panic("class")
				}
				atom = "["
				for j := 0; j < len(items); j++ {
					v := items[j]
					if v.char == '-' && !v.escaped && j > 0 && j < len(items)-1 {
						panic("range")
					}
					if j+2 < len(items) && items[j+1].char == '-' && !items[j+1].escaped {
						if v.char > items[j+2].char {
							panic("range")
						}
						atom += literal(v.char) + "-" + literal(items[j+2].char)
						j += 2
					} else {
						atom += literal(v.char)
					}
				}
				atom += "]"
			case '\\':
				atom = literal(escaped())
			default:
				if strings.ContainsRune(`.^$?*+)]{}`, c) {
					panic("syntax")
				}
				atom = literal(c)
			}
			if at() != 0 && strings.ContainsRune("?*+", at()) {
				atom += string(take())
				size++
			} else if at() == '{' {
				i++
				lower, upper := "", ""
				for at() >= '0' && at() <= '9' {
					lower += string(take())
				}
				comma := false
				if at() == ',' {
					comma = true
					i++
					for at() >= '0' && at() <= '9' {
						upper += string(take())
					}
				}
				lo, e := strconv.Atoi(lower)
				hi, he := strconv.Atoi(upper)
				if lower == "" || take() != '}' || e != nil || lo > 1000 || (upper != "" && (he != nil || hi > 1000 || lo > hi)) {
					panic("repeat")
				}
				multiplier, nesting := max(1, lo), max(1, lo)
				if comma {
					if upper != "" {
						multiplier = max(1, hi)
						nesting = max(1, hi)
					} else {
						multiplier = max(1, lo+1)
					}
				}
				count *= nesting
				size *= multiplier
				atom += "{" + strconv.Itoa(lo)
				if comma {
					atom += ","
					if upper != "" {
						atom += strconv.Itoa(hi)
					}
				}
				atom += "}"
			}
			cost += size
			repeat = max(repeat, count)
			if cost > 8192 || repeat > 1000 {
				panic("expansion")
			}
			text.WriteString(atom)
		}
		return node{text.String(), cost, repeat}
	}
	compiled := group(0)
	if at() == '$' {
		i++
	}
	if i != len(chars) {
		panic("syntax")
	}
	return `\A(?:` + compiled.text + `)\z`, nil
}
