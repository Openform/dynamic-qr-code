import { fileURLToPath } from 'node:url';
import { transformWithOxc } from 'vite';
import { defineConfig } from 'vitest/config';

// Components under src/app are .js files with JSX in them, as Next.js allows.
// Vite only reads JSX in .jsx files, so these are compiled as JSX first, which
// lets tests render components (with react-dom/server).
const jsxInJs = {
  name: 'jsx-in-js',
  enforce: 'pre',
  async transform(code, id) {
    if (!/\/src\/app\/.+\.js$/.test(id)) return null;
    return transformWithOxc(code, `${id}x`, { jsx: { runtime: 'automatic' } });
  },
};

export default defineConfig({
  plugins: [jsxInJs],
  resolve: {
    // The same "@/" alias as jsconfig.json, so tests can load route handlers.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
  },
});
