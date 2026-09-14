import { copyFile, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = path.join(root, 'dist/client');
const destination = path.join(root, 'dist/aws');
const html = await readFile(path.join(source, 'index.html'), 'utf8');
if (!html.includes('Interactive 3D forest') || !html.includes('/assets/')) {
  throw new Error('Static export is missing the forest entry or client assets.');
}

// These are Vinext/Cloudflare build metadata, not files for a public S3 origin.
const metadata = new Set(['.vite', '.assetsignore', '_headers']);
async function copyPublicFiles(directory, target, topLevel = false) {
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (topLevel && metadata.has(entry.name)) continue;
    if (entry.isSymbolicLink() || entry.name.startsWith('.') || entry.name.endsWith('.map')) {
      throw new Error(`Unexpected file in public export: ${path.join(directory, entry.name)}`);
    }
    const from = path.join(directory, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) await copyPublicFiles(from, to);
    else if (entry.isFile()) await copyFile(from, to);
    else throw new Error(`Unsupported public file: ${from}`);
  }
}
await rm(destination, { recursive: true, force: true });
await copyPublicFiles(source, destination, true);
console.log('Prepared public static site in dist/aws (build metadata excluded).');
