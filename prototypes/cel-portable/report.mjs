import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const ts = JSON.parse(readFileSync('results/typescript.json', 'utf8'));
const go = JSON.parse(readFileSync('results/go.json', 'utf8'));
const cases = JSON.parse(readFileSync('cases.json','utf8'));
const browser = JSON.parse(readFileSync('browser-evidence.json','utf8').replace(/^\uFEFF/,''));
assert.equal(browser.status,'passed');
assert.equal(browser.cases,ts.length,'Rerun the browser checks for these cases before regenerating the report');
assert.equal(browser.casesSha256,createHash('sha256').update(readFileSync('cases.json')).digest('hex'),'Browser evidence must match these exact cases');
assert.equal(ts.length, go.length);
const rows = ts.map((r, i) => {
  assert.equal(r.name, go[i].name);
  assert.deepEqual(r.actual, r.expected, r.name);
  assert.deepEqual(go[i].actual, r.expected, r.name);
  return {...r, input: {values:cases[i].input,fields:cases[i].fields},go: go[i].actual};
});
const data = JSON.stringify(rows).replaceAll('<', '\\u003c');
writeFileSync('report.html', `<!doctype html>
<html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>CEL portable — evidencia del prototipo</title>
<style>body{font:17px system-ui;max-width:960px;margin:48px auto;padding:0 24px;color:#193237;background:#f6f8f7}h1{font-size:36px}section{background:white;padding:24px;border:1px solid #cedad7;border-radius:12px;margin:24px 0}button,select{font:inherit;padding:10px;margin:4px;max-width:100%}button{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eff4f2;padding:16px;max-height:340px;overflow:auto}small{color:#526764}a{color:#086958}label{display:block}</style>
<h1>¿Puede CEL conservar las reglas del contrato?</h1>
<p>Prototipo desechable. ${rows.length} casos coinciden con el resultado esperado en Node/TypeScript, Go y Chrome. Propuesta: CEL acotado con tipos del host y RE2JS para patrones. Pendiente de decisión humana.</p>
<p>Este archivo muestra ejecuciones registradas. Cambiar de caso no vuelve a ejecutar los motores. El comando de reproducción está en README.md.</p>
<section><h2>Recorridos</h2><nav aria-label="Filtrar casos"><button data-filter="">Todos</button><button data-filter="decimal|canon|precision|scale|compare">Decimal exacto</button><button data-filter="date|Periodo|periods|instant">Fechas y Periodo</button><button data-filter="presence">Ausencia y null</button><button data-filter="pattern">Patrones</button><button data-filter="reject|invalid|type">Rechazos</button></nav>
<label for="case">Caso registrado</label><select id="case"></select><button id="prev">Anterior</button><button id="next">Siguiente</button>
<h3 id="name"></h3><h3>Expresión CEL</h3><pre id="expression"></pre><h3>Entrada y reglas del fixture</h3><pre id="input"></pre><h3>Esperado</h3><pre id="expected"></pre><h3>TypeScript</h3><pre id="actual"></pre><h3>Go</h3><pre id="go"></pre></section>
<section><h2>Navegador y dependencias</h2><p>Chrome 152 ejecutó todos los casos con script-src 'self', sin permisos de WASM/eval ni peticiones externas. El Worker pesa aproximadamente 96 KiB con gzip, excluidos los datos de prueba. RE2-WASM 1.0.2 falló con la CSP prevista y con su binding de navegador; no se parcheó.</p><h2>Qué aporta el host</h2><p>Decimal, fecha, instante, normalización, validación estructural y comparadores se implementan por separado en TypeScript y Go. CEL comprueba firmas y combina reglas. RE2JS y Go regexp evalúan los patrones tras verificarlos contra el perfil.</p><h2>Límites propuestos</h2><p>Patrones: 4096 caracteres, 32 niveles de grupos, 1000 de producto de repeticiones anidadas, 8192 unidades de coste expandido, entrada de 65 536 caracteres. CEL: 65 536 caracteres, 1024 nodos y 64 niveles. README.md precisa la fórmula y el alcance.</p><h2>Alcance de la evidencia</h2><p>Es un prototipo de decisión, no un cargador RDF, generador de cliente o implementación HTTP. No certifica el catálogo completo ni Firefox/Safari. Los tiempos observados no son un benchmark. Los códigos/rutas definitivos y presupuestos por petición conservan sus tickets de decisión.</p></section>
<script>const rows=${data};let visible=rows;const select=document.getElementById('case');function render(){const row=visible[select.selectedIndex];for(const key of ['name','expression','input','expected','actual','go'])document.getElementById(key).textContent=typeof row[key]==='string'?row[key]:JSON.stringify(row[key],null,2)}function filter(pattern){visible=rows.filter(r=>new RegExp(pattern,'i').test(r.name));select.replaceChildren(...visible.map(r=>new Option(r.name)));render()}document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>filter(b.dataset.filter));select.onchange=render;document.getElementById('prev').onclick=()=>{select.selectedIndex=(select.selectedIndex+visible.length-1)%visible.length;render()};document.getElementById('next').onclick=()=>{select.selectedIndex=(select.selectedIndex+1)%visible.length;render()};filter('');</script></html>`);
console.log(`Both runtimes: ${rows.length} matching results; report.html generated`);
