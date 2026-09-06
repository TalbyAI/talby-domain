import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
const files=new Map([['index.html','text/html'],['page.js','text/javascript'],['worker.js','text/javascript'],['re2.wasm','application/wasm'],['cases.json','application/json']]);
const server=createServer((req,res)=>{
  const parts=new URL(req.url,'http://localhost').pathname.split('/');
  const mode=parts[1],name=parts[2];
  if(!['strict','relaxed','no-wasm'].includes(mode)||!files.has(name)){res.writeHead(404);res.end();return;}
  const permission=mode==='relaxed'?" 'unsafe-eval'":mode==='strict'?" 'wasm-unsafe-eval'":'';
  res.writeHead(200,{'Content-Type':files.get(name),'Cache-Control':'no-store','Content-Security-Policy':`default-src 'none'; script-src 'self'${permission}; worker-src 'self'; connect-src 'self'`});
  res.end(readFileSync('dist/'+name));
});
server.listen(4178,'127.0.0.1',()=>console.log('http://127.0.0.1:4178/strict/index.html'));
