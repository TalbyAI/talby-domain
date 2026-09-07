import { RE2 } from 're2-wasm';
export const matches = (text: string, pattern: string) => {
  try { return new RE2(pattern, 'u').test(text); }
  catch (error) { console.error('WASM candidate:', error); throw error; }
};
