import { run } from './probe.ts';
import {fields} from './fields.ts';
self.onmessage = ({data}) => {
  const start = performance.now();
  const rows = data.map(c => ({name: c.name, expected: c.expected, actual: c.fields?fields(c.fields,c.input,c.inputOrder):run(c.expression, c.input,c.assert)}));
  self.postMessage({rows, elapsedMs: performance.now() - start});
};
