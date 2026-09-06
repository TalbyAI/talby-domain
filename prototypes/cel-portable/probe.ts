import { Environment } from '@marcbachmann/cel-js';
import { matches } from './regex.ts';
import { pattern } from './pattern.ts';

// PROTOTYPE: independent host implementation, not a contract runtime.
class Decimal { value: string; constructor(value: string) { this.value = value; } }
class CivilDate { value: string; constructor(value: string) { this.value = value; } }
class Instant { value: string; constructor(value: string) { this.value = value; } }
const spaces = '\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';
function trim(s: string): string {
  let start = 0, end = s.length;
  while (start < end && spaces.includes(s[start])) start++;
  while (end > start && spaces.includes(s[end - 1])) end--;
  return s.slice(start, end);
}
function instant(s: string): Instant {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.([0-9]+))?(Z|[+-]\d{2}:\d{2})$/.exec(s);
  if (!m || s.endsWith('\n')) throw Error('format');
  date(m[1]);
  const fraction = m[5] ?? '', zone = m[6];
  if (fraction.length > 4096) throw Error('limit');
  if (/[1-9]/.test(fraction.slice(3))) throw Error('precision');
  if (+m[2] > 23 || +m[3] > 59 || +m[4] > 59 || zone === '-00:00' || (zone !== 'Z' && (+zone.slice(1, 3) > 23 || +zone.slice(4) > 59))) throw Error('format');
  const iso = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${fraction.slice(0, 3).padEnd(3, '0')}${zone}`).toISOString();
  if (iso.length !== 24 || iso.startsWith('0000')) throw Error('range');
  return new Instant(iso);
}
function decimal(s: string): Decimal {
  if (!/^-?[0-9]+(?:\.[0-9]+)?$/.test(s) || s.endsWith('\n')) throw Error('format');
  if (s.replace(/[-.]/g, '').length > 4096) throw Error('limit');
  let [whole, fraction = ''] = s.replace(/^-/, '').split('.');
  whole = whole.replace(/^0+(?=[0-9])/, '');
  fraction = fraction.replace(/0+$/, '');
  const value = whole + (fraction ? '.' + fraction : '');
  return new Decimal(s.startsWith('-') && value !== '0' ? '-' + value : value);
}
function date(s: string): CivilDate {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s) || s.endsWith('\n')) throw Error('format');
  const [y, m, d] = s.split('-').map(Number);
  const days = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > days[m - 1]) throw Error('format');
  return new CivilDate(s);
}
function compare(a: Decimal, b: Decimal): bigint {
  const scale = Math.max(a.value.split('.')[1]?.length ?? 0, b.value.split('.')[1]?.length ?? 0);
  const integer = (s: string) => {
    const [w, f = ''] = s.split('.');
    return BigInt(w + f.padEnd(scale, '0'));
  };
  const x = integer(a.value), y = integer(b.value);
  return x < y ? -1n : x > y ? 1n : 0n;
}
export function normalize(type: string, value: any): any {
  if (type === 'integer') {if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw Error('type');return Object.is(value,-0)?0:value;}
  if (type === 'boolean') {if(typeof value !== 'boolean') throw Error('type');return value;}
  if(typeof value !== 'string' || !value.isWellFormed()) throw Error('type');
  switch(type) {
    case 'decimal':return decimal(value).value;
    case 'date':return date(value).value;
    case 'instant':return instant(value).value;
    case 'id':if(!/^[A-Za-z0-9_-]+$/.test(value)||value.endsWith('\n')) throw Error('format');return value;
    case 'string':return value;
    default:throw Error('type');
  }
}
export const trimValue = trim;
export const order = (type: string, a: any, b: any) => type === 'decimal' ? Number(compare(new Decimal(a),new Decimal(b))) : a < b ? -1 : a > b ? 1 : 0;
const env = new Environment({ unlistedVariablesAreDyn: false, limits: {maxAstNodes: 1024, maxDepth: 64} })
  .registerVariable('m', 'map<string, dyn>')
  .registerType('Decimal', Decimal).registerType('CivilDate', CivilDate)
  .registerType('Instant', Instant)
  .registerFunction('instant(string): Instant', instant)
  .registerFunction('instantCanon(Instant): string', x => x.value)
  .registerFunction('trim(string): string', trim)
  .registerFunction('decimalScale(Decimal): int', x => BigInt(x.value.split('.')[1]?.length ?? 0))
  .registerFunction('decimalPrecision(Decimal): int', x => BigInt(Math.max(x.value.replace(/[-.]/g, '').replace(/^0+/, '').length, x.value.split('.')[1]?.length ?? 0, 1)))
  .registerFunction('compareInstant(Instant, Instant): int', (a, b) => a.value < b.value ? -1n : a.value > b.value ? 1n : 0n)
  .registerFunction('decimal(string): Decimal', decimal)
  .registerFunction('date(string): CivilDate', date)
  .registerFunction('canon(Decimal): string', x => x.value)
  .registerFunction('compareDecimal(Decimal, Decimal): int', compare)
  .registerFunction('compareDate(CivilDate, CivilDate): int', (a, b) => a.value < b.value ? -1n : a.value > b.value ? 1n : 0n)
  .registerFunction('fullMatch(string, string): bool', (s, p) => {
    if (!s.isWellFormed() || [...s].length > 65536) throw Error('text-limit-or-unicode');
    return matches(s, pattern(p));
  });

export function run(expression: string, input: any, assertion = false) {
  try {
    if ([...expression].length > 65536) throw Error('expression-size');
    let quote = '', escaped = false, prefix = 0, depth = 0;
    for (const c of expression) {
      if (quote) {if (escaped) escaped = false; else if (c === '\\') escaped = true; else if(c === quote) quote = ''; continue;}
      if (c === '"' || c === "'") {quote = c; prefix = 0; continue;}
      if (c === '!' || c === '-') prefix++; else if (!' \t\n\r'.includes(c)) prefix = 0;
      if (c === '(') depth++; if (c === ')') depth--;
      if (prefix > 64 || depth > 64) throw Error('source-limit');
    }
    const allowed = new Set(['has','instant','instantCanon','trim','decimalScale','decimalPrecision','compareInstant','decimal','date','canon','compareDecimal','compareDate','fullMatch']);
    let count = 0;
    const visit = (node: any, depth = 0) => {
      if (++count > 1024 || depth > 64) throw Error('expression-limit');
      const descend = (n: any) => visit(n, depth + 1);
      if (node.op === 'call') {if (!allowed.has(node.args[0])) throw Error('function');node.args[1].forEach(descend);}
      else if (node.op === '.') descend(node.args[0]);
      else if (node.op === '!_' || node.op === '-_') descend(node.args);
      else if (['&&','||','==','!=','<','<=','>','>='].includes(node.op)) node.args.forEach(descend);
      else if (node.op === 'id') {if(node.args !== 'm') throw Error('variable');}
      else if (node.op === 'value') {if (!['string','bigint','boolean'].includes(typeof node.args) && node.args !== null) throw Error('literal');}
      else throw Error('syntax');
    };
    visit(env.parse(expression).ast);
    const checked=env.check(expression);
    if (!checked.valid || assertion && checked.type !== 'bool') throw Error('type');
  } catch { return {status:'check-error'}; }
  try {
    const value = env.evaluate(expression, input);
    return { status: 'ok', value: typeof value === 'bigint' ? Number(value) : value };
  } catch { return { status: 'eval-error' }; }
}
