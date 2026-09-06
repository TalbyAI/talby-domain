import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const ts = JSON.parse(readFileSync('results/typescript.json', 'utf8'));
const go = JSON.parse(readFileSync('results/go.json', 'utf8'));
assert.equal(ts.length, go.length);
const rows = ts.map((r, i) => {
  assert.equal(r.name, go[i].name);
  assert.deepEqual(r.actual, r.expected, r.name);
  assert.deepEqual(go[i].actual, r.expected, r.name);
  return {...r, go: go[i].actual};
});
const data = JSON.stringify(rows).replaceAll('<', '\\u003c');
writeFileSync('report.html', `<!doctype html>
<html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>CEL portable — evidencia del prototipo</title>
<style>body{font:17px system-ui;max-width:960px;margin:48px auto;padding:0 24px;color:#193237;background:#f6f8f7}h1{font-size:36px}section{background:white;padding:24px;border:1px solid #cedad7;border-radius:12px;margin:24px 0}button,select{font:inherit;padding:10px;margin:4px;max-width:100%}button{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eff4f2;padding:16px;max-height:340px;overflow:auto}small{color:#526764}a{color:#086958}label{display:block}</style>
<h1>¿Puede CEL conservar las reglas del contrato?</h1>
<p>Prototipo desechable. ${rows.length} casos compartidos coinciden con el resultado esperado en TypeScript y Go. Es evidencia parcial; no es una decisión de adopción.</p>
<p>Este archivo muestra ejecuciones registradas. Cambiar de caso no vuelve a ejecutar los motores. El comando de reproducción está en README.md.</p>
<section><h2>Recorridos</h2><nav aria-label="Filtrar casos"><button data-filter="">Todos</button><button data-filter="decimal|canon|precision|scale|compare">Decimal exacto</button><button data-filter="date|Periodo|periods|instant">Fechas y Periodo</button><button data-filter="presence">Ausencia y null</button><button data-filter="pattern">Patrones</button><button data-filter="reject|invalid|type">Rechazos</button></nav>
<label for="case">Caso registrado</label><select id="case"></select><button id="prev">Anterior</button><button id="next">Siguiente</button>
<h3 id="name"></h3><h3>Expresión CEL</h3><pre id="expression"></pre><h3>Esperado</h3><pre id="expected"></pre><h3>TypeScript</h3><pre id="actual"></pre><h3>Go</h3><pre id="go"></pre></section>
<section><h2>Qué aporta el host</h2><p>Decimal exacto, fecha civil, instante del perfil, trim y comparadores son extensiones implementadas por separado en ambos hosts. CEL comprueba sus firmas y compone las reglas. En TypeScript los patrones usan RE2-WASM; Go usa regexp.</p><h2>Qué falta demostrar</h2><p>Carga en navegador, parser del subconjunto completo de patrones y límites operativos comunes; catálogo de identificadores, validación estructural, acumulación de restricciones y diagnósticos por rutas. Las dos inclusiones de Periodo se prueban como dos aserciones, sin un cargador de modelos.</p><p>No hay comparación de rendimiento ni certificación de seguridad. El caso adversario tiene 30 001 caracteres; un caso no demuestra por sí solo una cota de complejidad.</p></section>
<script>const rows=${data};let visible=rows;const select=document.getElementById('case');function render(){const row=visible[select.selectedIndex];for(const key of ['name','expression','expected','actual','go'])document.getElementById(key).textContent=typeof row[key]==='string'?row[key]:JSON.stringify(row[key],null,2)}function filter(pattern){visible=rows.filter(r=>new RegExp(pattern,'i').test(r.name));select.replaceChildren(...visible.map(r=>new Option(r.name)));render()}document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>filter(b.dataset.filter));select.onchange=render;document.getElementById('prev').onclick=()=>{select.selectedIndex=(select.selectedIndex+visible.length-1)%visible.length;render()};document.getElementById('next').onclick=()=>{select.selectedIndex=(select.selectedIndex+1)%visible.length;render()};filter('');</script></html>`);
console.log(`Both runtimes: ${rows.length} matching results; report.html generated`);
