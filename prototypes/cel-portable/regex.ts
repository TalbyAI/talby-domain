import { RE2JS } from 're2js';
export const matches = (text: string, pattern: string) => RE2JS.compile(pattern).matcher(text).matches();
