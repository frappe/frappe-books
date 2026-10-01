import { test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build, loadConfigFromFile, preview, type PreviewServer } from 'vite';

const frontendRoot = path.resolve(__dirname, '../../..');

// Compile fixtures as `vite build` does. Otherwise Vue's dev compiler keeps
// template comments, and a component with a root comment drops its attrs.
process.env.NODE_ENV = 'production';

/**
 * Build `tests/ui/fixtures/<name>.html` with the app's Vite config and serve
 * it while the tests in the calling file run. Returns the fixture URL getter.
 */
export function serveFixture(name: string): () => string {
  let server: PreviewServer | undefined;
  let directory: string | undefined;
  let url = '';

  test.beforeAll(async () => {
    const loaded = await loadConfigFromFile(
      { command: 'serve', mode: 'test' },
      path.join(frontendRoot, 'vite.config.ts')
    );
    directory = await mkdtemp(path.join(tmpdir(), `books-${name}-`));
    const config = {
      ...loaded!.config,
      configFile: false as const,
      root: frontendRoot,
      logLevel: 'error' as const,
      build: {
        ...loaded!.config.build,
        outDir: directory,
        rollupOptions: {
          input: path.join(frontendRoot, `tests/ui/fixtures/${name}.html`),
        },
      },
      preview: { host: '127.0.0.1', port: 0, proxy: {} },
    };
    await build(config);
    server = await preview(config);
    url = `${server.resolvedUrls!.local[0]}tests/ui/fixtures/${name}.html`;
  });

  test.afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) =>
        server!.httpServer.close(() => resolve())
      );
    }
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  return () => url;
}
