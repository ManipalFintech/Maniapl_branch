import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A unique id per build. The running app compares it with /version.json so a
// tab that was opened before a new deploy knows to reload (otherwise it keeps
// running the old code until someone refreshes manually).
const BUILD_ID = String(Date.now());

function versionFile() {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
    }
  };
}

export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: { port: 5173 }
});
