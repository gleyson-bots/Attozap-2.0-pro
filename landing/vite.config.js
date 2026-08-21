import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const page = (path) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: page('./index.html'),
        login: page('./login.html'),
        cadastro: page('./cadastro.html'),
        portal: page('./portal.html'),
        admin: page('./admin.html'),
        loginIndex: page('./login/index.html'),
        cadastroIndex: page('./cadastro/index.html'),
        portalIndex: page('./portal/index.html'),
        adminIndex: page('./admin/index.html'),
      },
    },
  },
});
