import { after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { withFieldProperties } from './doctypes.mjs';

const directory = await mkdtemp(path.join(tmpdir(), 'books-model-tests-'));
after(() => rm(directory, { recursive: true, force: true }));
const output = path.join(directory, 'models.cjs');
const frontend = fileURLToPath(new URL('../..', import.meta.url));
await build({
  absWorkingDir: frontend,
  stdin: {
    contents: `
      export { Fyo } from './fyo';
      export { getSchemas } from './schemas';
      export { getDoctypeFieldProperties } from './tests/helpers/doctypeFieldProperties';
      export { getPrintTemplateDocValues } from './src/utils/printTemplateData';
    `,
    resolveDir: frontend,
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: output,
});
const bundle = createRequire(import.meta.url)(output);
export const { Fyo, getPrintTemplateDocValues } = bundle;
export const { fieldProperties, getSchemas } = withFieldProperties(bundle);
