async page => {
  await page.goto('http://127.0.0.1:4178/strict/index.html');
  await page.waitForFunction(()=>document.getElementById('result').textContent.startsWith('{'));
  const strict=JSON.parse(await page.locator('#result').innerText());
  if(strict.status!=='load-error'||!strict.message.includes('unsafe-eval'))throw Error('Expected CSP rejection of the unmodified WASM package');
  const errors=[];
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
  await page.goto('http://127.0.0.1:4178/relaxed/index.html');
  await page.waitForFunction(()=>document.getElementById('result').textContent.startsWith('{'));
  const relaxed=JSON.parse(await page.locator('#result').innerText());
  if(relaxed.status!=='failed')throw Error('Expected unmodified browser packaging failure');
  return {strict,relaxed:{status:relaxed.status,cases:relaxed.cases,failures:relaxed.failures.length},firstError:errors[0]};
}
