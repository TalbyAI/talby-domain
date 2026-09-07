import {normalize, trimValue, order} from './probe.ts';

// Tiny effective-model fixture. No RDF loader, generated client or HTTP API.
export function fields(spec: any[], input: any, inputOrder?: string[]): any {
  const value: any = {}, issues: any[] = [];
  const issue = (field: string, rule: string) => issues.push({field,rule});
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {status:'validation-error',value,issues:[{field:'',rule:'type'}]};
  try {
    for(const f of spec) {
      const rules = f.rules ?? [];
      const minima = rules.flatMap(r=>r.min === undefined?[]:[normalize(f.type,r.min)]);
      const maxima = rules.flatMap(r=>r.max === undefined?[]:[normalize(f.type,r.max)]);
      const enums = rules.filter(r=>r.oneOf !== undefined).map(r=> {
        const e = r.oneOf.map(x=>normalize(f.type,x));
        if(!e.length || new Set(e).size!==e.length) throw Error('enum');
        return e;
      });
      if(minima.some(a=>maxima.some(b=>order(f.type,a,b)>0))) throw Error('range');
      if(enums.length && !enums[0].some(x=>enums.every(e=>e.includes(x)))) throw Error('enum');
      if(f.type!=='string'&&f.type!=='id'&&rules.some(r=>r.minLength!==undefined||r.maxLength!==undefined)) throw Error('length-type');
      const lo=Math.max(0,...rules.map(r=>r.minLength??0)), hi=Math.min(Infinity,...rules.map(r=>r.maxLength??Infinity));
      if(lo>hi) throw Error('length');
    }
  } catch {return {status:'model-error'};}
  for(const k of inputOrder??Object.keys(input)) if(!spec.some(f=>f.name===k)) issue(k,'unknown');
  for(const f of spec) {
    const rules = f.rules ?? [];
    if(!Object.hasOwn(input,f.name)) {if(rules.some(r=>r.required===true))issue(f.name,'required');continue;}
    let v = input[f.name];
    if(v===null) {if(rules.some(r=>r.nullable===false))issue(f.name,'nullable');else value[f.name]=null;continue;}
    if(f.type === 'period') {
      const result=fields([{name:'inicio',type:'date',rules:[{required:true,nullable:false}]},{name:'fin',type:'date',rules:[{required:true,nullable:false}]}],v);
      for(const e of result.issues??[]) issue(f.name+'.'+e.field,e.rule);
      if(result.status==='ok'&&result.value.fin<result.value.inicio) {issue(f.name+'.inicio','period');issue(f.name+'.fin','period');}
      value[f.name]=result.value;continue;
    }
    try {for(const r of rules) if(r.trim) {if(typeof v!=='string')throw Error('type');v=trimValue(v);} v=normalize(f.type,v);}
    catch {issue(f.name,'type-or-format');continue;}
    value[f.name]=v;
    for(const r of rules) {
      if((f.type==='string'||f.type==='id') && (r.minLength!==undefined && [...v].length<r.minLength || r.maxLength!==undefined && [...v].length>r.maxLength)) issue(f.name,'length');
      if(r.min!==undefined&&(order(f.type,v,normalize(f.type,r.min))<0 || r.minInclusive===false&&order(f.type,v,normalize(f.type,r.min))===0)) issue(f.name,'range');
      if(r.max!==undefined&&(order(f.type,v,normalize(f.type,r.max))>0 || r.maxInclusive===false&&order(f.type,v,normalize(f.type,r.max))===0)) issue(f.name,'range');
      if(r.oneOf && !r.oneOf.map(x=>normalize(f.type,x)).includes(v)) issue(f.name,'oneOf');
      if(f.type==='decimal') {
        const s=v.split('.')[1]?.length??0,p=Math.max(v.replace(/[-.]/g,'').replace(/^0+/,'').length,s,1);
        if(r.precision!==undefined&&p>r.precision)issue(f.name,'precision');if(r.scale!==undefined&&s>r.scale)issue(f.name,'scale');
      }
      if(f.type==='id' && (r.prefix!==undefined&&!v.startsWith(r.prefix)||r.suffix!==undefined&&!v.endsWith(r.suffix)))issue(f.name,'identifier');
    }
    if(f.type==='id' && (v.length<1 || v.length>(rules.some(r=>r.maxLength!==undefined)?Infinity:128)))issue(f.name,'length');
  }
  return {status:issues.length?'validation-error':'ok',value,issues};
}
