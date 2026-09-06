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
for (const [p,s,expected] of [
 ['^a$','a',true],['^a$','a\n',false],['\\$','$',true],['a|bc','bc',true],['(?:a|bc)+','abca',true],
 ['[a-c]+','abc',true],['[-a]+','-a',true],['[a-]+','a-',true],['[a\\-z]+','-az',true],
 ['[\\]\\\\]+',']\\',true],['\\n\\r\\t','\n\r\t',true],['[0-9]{2,4}','123',true],
 ['a{0}','',true],['a{2,}','aaa',true],['a?b*c+','abbbcc',true],['','',true],['😀{2}','😀😀',true],
 ['(a{10}){100}','a'.repeat(1000),true],['('.repeat(32)+'a'+')'.repeat(32),'a',true],
 ['a'.repeat(4096),'a'.repeat(4096),true],['a*','a'.repeat(65536),true],['[a^]','^',true],['a\0b','a\0b',true],['[\\^]','^',true]
]) add('profile pattern '+p.slice(0,45),`fullMatch(m.text,m.pattern)`,expected,'ok',{m:{text:s,pattern:p}});
for (const p of ['.','[^a]','\\d','\\w','\\s','\\p{L}','\\b','(a)\\1','(?=a)','(?<=a)','(?i:a)','a+?','a++','a{1001}','a{3,2}','a{2,1001}','a{,2}','a^b','a$b','^^a','a$$','[z-a]','[]','[[:alpha:]]','[😀]','\\q','a{2}{3}','(','[a','a\\','('.repeat(33)+'a'+')'.repeat(33),'a'.repeat(4097),'(a{1000}){2}','(abcdefghi){1000}']) add('reject pattern '+p.slice(0,45),'fullMatch(m.text,m.pattern)',null,'eval-error',{m:{text:'a',pattern:p}});
add('reject pattern input ceiling','fullMatch(m.text,m.pattern)',null,'eval-error',{m:{text:'a'.repeat(65537),pattern:'a*'}});
for(const expression of ['decimal("0.1") == decimal("0.10")','date("2000-01-01") == date("2000-01-01")','"a".matches("a")','[1,2].all(x,x>0)','timestamp("2000-01-01T00:00:00Z")','1.5 < 2.0','1 + 2','true ? false : true','true'+' '.repeat(65533),'!'.repeat(65)+'true',Array(520).fill('true').join(' && ')]) add('reject CEL profile '+expression.slice(0,50),expression,null,'check-error');
const host=(name,fields,input,value,issues=[])=>cases.push({name:'host '+name,fields,input,expected:{status:issues.length?'validation-error':'ok',value,issues}});
const f=(type,rules=[])=>[{name:'x',type,rules}];
const err=(rule,field='x')=>({field,rule});
for(const [input,valid,value] of [[9007199254740991,true,9007199254740991],[9007199254740992,false,null],[-9007199254740991,true,-9007199254740991],[1.5,false,null],['1',false,null],[1,true,1]])host('JSON integer '+input,f('integer'),{x:input},valid?{x:value}:{},valid?[]:[err('type-or-format')]);
host('JSON boolean',f('boolean'),{x:true},{x:true});host('reject boolean string',f('boolean'),{x:'true'},{},[err('type-or-format')]);
host('reject lone surrogate',f('string'),{x:'\ud800'},{},[err('type-or-format')]);host('emoji length',f('string',[{minLength:1,maxLength:1}]),{x:'😀'},{x:'😀'});host('combining length',f('string',[{maxLength:1}]),{x:'e\u0301'},{x:'e\u0301'},[err('length')]);
host('trim before minimum length',f('string',[{trim:true,minLength:1}]),{x:' \t '},{x:''},[err('length')]);
for(const n of [1,128,129]) host('identifier length '+n,f('id'),{x:'a'.repeat(n)},{x:'a'.repeat(n)},n>128?[err('length')]:[]);
for(const input of ['prj_A-1','prj_a-1'])host('identifier case preserved '+input,f('id',[{prefix:'prj_'}]),{x:input},{x:input});
host('identifier overlap',f('id',[{prefix:'ab',suffix:'bc'}]),{x:'abc'},{x:'abc'});
host('identifier wrong case',f('id',[{prefix:'prj_'}]),{x:'PRJ_A'},{x:'PRJ_A'},[err('identifier')]);
host('identifier unicode',f('id'),{x:'prj_á'},{},[err('type-or-format')]);
host('identifier explicit trim',f('id',[{trim:true,prefix:'prj_'}]),{x:' prj_A '},{x:'prj_A'});
host('decimal inherited range',f('decimal',[{min:'0',max:'100'},{max:'10'}]),{x:'20.00'},{x:'20'},[err('range')]);
host('decimal precision and scale',f('decimal',[{precision:2,scale:2}]),{x:'0.001'},{x:'0.001'},[err('precision'),err('scale')]);
host('exclusive decimal minimum',f('decimal',[{min:'0.1',minInclusive:false}]),{x:'0.10'},{x:'0.1'},[err('range')]);
host('inclusive decimal minimum',f('decimal',[{min:'0.1'}]),{x:'0.10'},{x:'0.1'});
host('canonical enum',f('decimal',[{oneOf:['1.0','2']}]),{x:'01.000'},{x:'1'});
for(const [name,rules] of [['enum intersection',[{oneOf:['a']},{oneOf:['b']}]],['inverted range',[{min:'z',max:'a'}]],['empty enum',[{oneOf:[]}]],['inherited length contradiction',[{minLength:5},{maxLength:2}]]])cases.push({name:'host reject model '+name,fields:f('string',rules),input:{x:'a'},expected:{status:'model-error'}});
cases.push({name:'host reject canonical duplicate enum',fields:f('decimal',[{oneOf:['0.1','0.10']}]),input:{x:'0.1'},expected:{status:'model-error'}});
host('required cannot be weakened',f('string',[{required:true},{required:false}]),{},{},[err('required')]);
host('nullable cannot be weakened',f('string',[{nullable:false},{nullable:true}]),{x:null},{},[err('nullable')]);
host('independent errors',[{name:'a',type:'decimal'},{name:'b',type:'date'}],{a:'wrong',b:'2026-02-30'}, {},[err('type-or-format','a'),err('type-or-format','b')]);
host('unknown input',f('string'),{x:'a',extra:1},{x:'a'},[err('unknown','extra')]);
const periods=[{name:'a',type:'period'},{name:'b',type:'period'}];
const inputPeriods={a:{inicio:'2026-01-01',fin:'2026-02-01'},b:{inicio:'2026-03-01',fin:'2026-02-01'}};
host('two independent Periodo inclusions',periods,inputPeriods,inputPeriods,[err('period','b.inicio'),err('period','b.fin')]);
host('invalid date skips dependent assertion',periods,{a:{inicio:'bad',fin:'2026-02-01'},b:inputPeriods.b},{a:{fin:'2026-02-01'},b:inputPeriods.b},[err('type-or-format','a.inicio'),err('period','b.inicio'),err('period','b.fin')]);
const normFields=[{name:'amount',type:'decimal',rules:[{trim:true}]},{name:'when',type:'instant',rules:[{trim:true}]}];
const normalized={amount:'1.23',when:'2026-01-01T00:00:00.000Z'};
host('pipeline normalization',normFields,{amount:' 0001.2300 ',when:' 2026-01-01T01:00:00+01:00 '},normalized);
host('pipeline idempotence',normFields,normalized,normalized);
cases.push({name:'assert must return boolean',expression:'canon(decimal("1"))',assert:true,input:{},expected:{status:'check-error'}});
cases.push({name:'assert false is a validation outcome',expression:'compareDecimal(decimal("2"),decimal("1")) < 0',assert:true,input:{},expected:{status:'ok',value:false}});
writeFileSync('cases.json', JSON.stringify(cases,null,2));
console.log(`Generated ${cases.length} shared probes`);
