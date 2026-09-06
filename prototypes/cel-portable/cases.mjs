import { writeFileSync } from 'node:fs';
const cases = [];
const q = JSON.stringify;
const add = (name, expression, value, status = 'ok', input = {}) => cases.push({name, expression, input, expected: status === 'ok' ? {status, value} : {status}});
for (const [input, canon] of [['0001.2300','1.23'],['-0.000','0'],['0.001','0.001'],['1000.00','1000'],['12.340','12.34'],['12.345','12.345'],['9007199254740993.01','9007199254740993.01'],['0'.repeat(4096),'0']]) {
  const label = input.length > 40 ? '4096 digits' : input;
  add('canon '+label, `canon(decimal(${q(input)}))`, canon);
  add('idempotent '+label, `canon(decimal(canon(decimal(${q(input)}))))`, canon);
}
for (const input of ['1e2','+1','1.','.1','1\n','0'.repeat(4097)]) add('invalid decimal '+input.slice(0,20), `canon(decimal(${q(input)}))`, null, 'eval-error');
for (const [a,b,result] of [['0.1','0.10',0],['9007199254740993.01','9007199254740993.00',1],['-0.001','0',-1],['-10','-2',-1],['2','10',-1]]) add('compare '+a+' / '+b, `compareDecimal(decimal(${q(a)}),decimal(${q(b)}))`,result);
for (const s of ['2000-02-29','0001-01-01','9999-12-31']) add('valid date '+s, `compareDate(date(${q(s)}),date(${q(s)}))`,0);
for (const s of ['1900-02-29','2025-02-29','2026-04-31','2026-9-06','0000-01-01','2026-09-06\n']) add('invalid date '+s, `compareDate(date(${q(s)}),date("2000-01-01"))`,null,'eval-error');
for (const [start,end,valid] of [['2026-01-01','2026-12-31',true],['2026-01-01','2026-01-01',true],['2026-12-31','2026-01-01',false]]) add('Periodo '+start+' / '+end,`compareDate(date(${q(end)}),date(${q(start)})) >= 0`,valid);
add('two nested periods', 'compareDate(date("2026-02-01"),date("2026-01-01")) >= 0 && compareDate(date("2026-01-01"),date("2026-02-01")) >= 0',false);
for (const required of [false,true]) for (const nullable of [false,true]) for (const [name,map,present,isnull] of [['absent','{}',false,false],['null','{"x":null}',true,true],['value','{"x":"v"}',true,false]]) {
  add(`presence ${required}/${nullable}/${name}`, `(!${required} || has(m.x)) && (!has(m.x) || ${nullable} || m.x != null)`, (!required || present) && (!present || nullable || !isnull), 'ok', {m: JSON.parse(map)});
}
for (const [s,p,v] of [['uno.dos-3','[A-Za-z0-9_-]+(\\.[A-Za-z0-9_-]+)*',true],['uno\n','[a-z]+',false],['😀','😀',true],['😀😀','😀',false],['a'.repeat(30000)+'!','(a+)+',false],['a'.repeat(1000),'a{1000}',true]]) add('pattern '+p+' / '+s.slice(0,12),`fullMatch(${q(s)},${q(p)})`,v);
for (const expr of ['compareDecimal("1","2")','compareDate(decimal("1"),date("2000-01-01"))','decimal(1)','unknownFunction("x")','date("2000-01-01") < date("2001-01-01")']) add('reject type '+expr,expr,null,'check-error');
add('false assertion is not evaluation error','compareDecimal(decimal("2"),decimal("1")) < 0',false);
for (const [input,canon] of [
  ['2026-09-06T12:34:56+02:00','2026-09-06T10:34:56.000Z'],
  ['2026-01-01T00:15:00+01:00','2025-12-31T23:15:00.000Z'],
  ['2026-09-06T00:00:00.12Z','2026-09-06T00:00:00.120Z'],
  ['2026-09-06T00:00:00.123000Z','2026-09-06T00:00:00.123Z'],
  ['0001-01-01T00:00:00Z','0001-01-01T00:00:00.000Z'],
  ['2026-09-06T00:00:00.'+'0'.repeat(4096)+'Z','2026-09-06T00:00:00.000Z']]) {
  add('instant '+input.slice(0,40),`instantCanon(instant(${q(input)}))`,canon);
  add('instant idempotence '+input.slice(0,40),`instantCanon(instant(instantCanon(instant(${q(input)}))))`,canon);
}
for (const input of ['2026-09-06T00:00:00.123001Z','2016-12-31T23:59:60Z','0001-01-01T00:00:00+01:00','9999-12-31T23:59:59-01:00','2026-09-06T00:00:00-00:00','2026-02-30T00:00:00Z','2026-09-06T24:00:00Z','2026-09-06T00:00:00+24:00','2026-09-06T00:00:00.'+'0'.repeat(4097)+'Z']) add('invalid instant '+input.slice(0,40),`instantCanon(instant(${q(input)}))`,null,'eval-error');
add('equal offsets', 'compareInstant(instant("2026-09-06T12:00:00+02:00"),instant("2026-09-06T10:00:00Z"))',0);
for (const [s,p,scale] of [['0.001',3,3],['1000.00',4,0],['12.340',4,2],['12.345',5,3],['-0.000',1,0]]) {
  add('precision '+s,`decimalPrecision(decimal(${q(s)}))`,p);
  add('scale '+s,`decimalScale(decimal(${q(s)}))`,scale);
}
for (const [s,t] of [[' \u00a0x\ufeff','x'],['x y','x y'],['\u0085x\u200b','\u0085x\u200b'],['\u180ex','\u180ex'],[' \t\n','']]) add('trim '+q(s),`trim(${q(s)})`,t);
add('trim before decimal','canon(decimal(trim(" 0001.2300 ")))', '1.23');
add('trim and decimal idempotence','canon(decimal(trim(canon(decimal(trim(" 0001.2300 "))))))','1.23');
add('trim null type','trim(null)',null,'check-error');
writeFileSync('cases.json', JSON.stringify(cases,null,2));
console.log(`Generated ${cases.length} shared probes`);
