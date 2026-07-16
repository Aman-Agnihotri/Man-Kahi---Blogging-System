import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  // import.meta.client is a Nuxt build-time macro (replaced by unplugin
  // during the real Nuxt build); under plain vitest/vite it is otherwise
  // undefined/falsy, which short-circuits client-only guards (e.g.
  // useAuth.ts's linkWithGoogle/loginWithGoogle). Textually define it true
  // for the test build rather than touching source - see
  // .claude/agent-memory/implementer/facts.md.
  esbuild: {
    define: {
      'import.meta.client': 'true',
    },
  },
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('.', import.meta.url)),
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.spec.ts'],
  },
});
