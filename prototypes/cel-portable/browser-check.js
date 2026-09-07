async page => {
  const requests=[];
  page.on('request',r=>requests.push(r.url()));
  await page.goto('http://127.0.0.1:4178/no-wasm/index.html');
  await page.waitForFunction(()=>document.getElementById('result').textContent.startsWith('{'));
  const result=JSON.parse(await page.locator('#result').innerText());
  if(result.status!=='passed'||result.cases<210||result.failures.length)throw Error(JSON.stringify(result));
  if(requests.some(url=>!url.startsWith('http://127.0.0.1:4178/')||url.endsWith('.wasm')))throw Error('Unexpected network dependency');
  return {...result,requests};
}
