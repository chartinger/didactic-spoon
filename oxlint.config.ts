import { defineConfig } from 'oxlint';

export default defineConfig({
  plugins: ['eslint', 'typescript', 'unicorn', 'import', 'node', 'vitest', 'promise'],
  options: {
    typeAware: true,
  },
  rules: {
    'unbound-method': 'off',
    'typescript/no-base-to-string': 'off',
  },
});
