import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let html = await readFile(resolve(root, 'index.html'), 'utf8');
const stylesheet = await readFile(resolve(root, 'styles.css'), 'utf8');
html = html.replace('<link rel="stylesheet" href="styles.css">', `<style>\n${stylesheet}\n</style>`);
for (const file of ['simulation', 'tactical', 'renderer', 'audio', 'game']) {
  const source = await readFile(resolve(root, `src/${file}.js`), 'utf8');
  html = html.replace(`<script src="src/${file}.js"></script>`, () => `<script>\n${source.replaceAll('</script', '<\\/script')}\n</script>`);
}
const output = resolve(root, '盲区.html');
await writeFile(output, html);
console.log(`Built ${output}\n${(Buffer.byteLength(html) / 1024).toFixed(1)} KB · zero dependencies · opens offline via file://`);
