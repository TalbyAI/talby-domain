// PROTOTYPE: proposed operational limits, not new domain constraints.
export function pattern(source: string): string {
  if (!source.isWellFormed() || [...source].length > 4096) throw Error('pattern-limit-or-unicode');
  const chars = [...source];
  let i = 0;
  if (chars[0] === '^') i++;
  function literal(c: string) { return '\\x{' + c.codePointAt(0)!.toString(16) + '}'; }
  function escaped(): string {
    const c = chars[i++];
    if (c === 'n') return '\n';
    if (c === 'r') return '\r';
    if (c === 't') return '\t';
    if (!c || !'\\.^$|?*+()[]{}-'.includes(c)) throw Error('pattern-escape');
    return c;
  }
  function group(depth: number): {text: string, cost: number, repeat: number} {
    if (depth > 32) throw Error('pattern-depth');
    let text = '', cost = 0, repeat = 1;
    while (i < chars.length && chars[i] !== ')' && !(chars[i] === '$' && i === chars.length - 1)) {
      let atom = '', size = 1, count = 1;
      const c = chars[i++];
      if (c === '|') { text += '|'; cost++; continue; }
      if (c === '(') {
        if (chars[i] === '?' && chars[i + 1] === ':') i += 2;
        const nested = group(depth + 1);
        if (chars[i++] !== ')') throw Error('pattern-group');
        atom = '(?:' + nested.text + ')'; size = nested.cost + 1; count = nested.repeat;
      } else if (c === '[') {
        const items: {char: string, escaped: boolean}[] = [];
        while (i < chars.length && chars[i] !== ']') {
          const escapedChar = chars[i] === '\\';
          let char = chars[i++];
          if (escapedChar) char = escaped();
          if (char.codePointAt(0)! > 127 || (!escapedChar && (char === '[' || char === '^' && !items.length))) throw Error('pattern-class');
          items.push({char, escaped: escapedChar});
        }
        if (chars[i++] !== ']' || !items.length) throw Error('pattern-class');
        atom = '[';
        for (let j = 0; j < items.length; j++) {
          const item = items[j];
          if (item.char === '-' && !item.escaped && j > 0 && j < items.length - 1) throw Error('pattern-range');
          if (j + 2 < items.length && items[j + 1].char === '-' && !items[j + 1].escaped) {
            if (item.char > items[j + 2].char) throw Error('pattern-range');
            atom += literal(item.char) + '-' + literal(items[j + 2].char); j += 2;
          } else atom += literal(item.char);
        }
        atom += ']';
      } else if (c === '\\') atom = literal(escaped());
      else {
        if ('.^$?*+)]{}'.includes(c)) throw Error('pattern-syntax');
        atom = literal(c);
      }
      if (['?', '*', '+'].includes(chars[i])) { atom += chars[i++]; size++; }
      else if (chars[i] === '{') {
        i++;
        let lower = '', upper = '';
        while (/[0-9]/.test(chars[i] ?? '')) lower += chars[i++];
        let comma = false;
        if (chars[i] === ',') { comma = true; i++; while (/[0-9]/.test(chars[i] ?? '')) upper += chars[i++]; }
        if (!lower || chars[i++] !== '}' || +lower > 1000 || (upper && (+upper > 1000 || +lower > +upper))) throw Error('pattern-repeat');
        const multiplier = Math.max(1, comma ? (upper ? +upper : +lower + 1) : +lower);
        count *= Math.max(1, comma ? (upper ? +upper : +lower) : +lower);
        size *= multiplier;
        atom += '{' + Number(lower) + (comma ? ',' + (upper ? Number(upper) : '') : '') + '}';
      }
      cost += size; repeat = Math.max(repeat, count);
      if (cost > 8192 || repeat > 1000) throw Error('pattern-expansion');
      text += atom;
    }
    return {text, cost, repeat};
  }
  const result = group(0);
  if (chars[i] === '$') i++;
  if (i !== chars.length) throw Error('pattern-syntax');
  return '\\A(?:' + result.text + ')\\z';
}
