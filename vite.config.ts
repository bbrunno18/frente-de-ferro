import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    base: './',
    server: { host: true, port: 5173 },
    plugins: demo ? [viteSingleFile()] : [],
    build: {
      outDir: demo ? 'dist-demo' : 'dist',
      chunkSizeWarningLimit: 2000,
      rollupOptions: { output: demo ? { inlineDynamicImports: true } : { manualChunks: { three: ['three'] } } },
    },
  };
});
