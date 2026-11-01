import { createServer } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
});
try {
  const { renderStatic } = await server.ssrLoadModule(
    '/src/seo/static-pages.tsx',
  );
  const pages = {};
  for (const path of ['/', '/business']) {
    const html = await renderStatic(path);
    if (!html.includes('<h1') || html.length < 100)
      throw new Error(`Empty public prerender: ${path}`);
    pages[path] = html;
  }
  await writeFile('dist/seo-static.json', JSON.stringify(pages));
  await writeFile(
    'dist/offline.html',
    await readFile('dist/index.html', 'utf8'),
  );
  console.log('Generated public marketing HTML from existing React components');
} finally {
  await server.close();
}
