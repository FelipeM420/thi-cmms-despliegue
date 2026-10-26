import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode }) => {
  // OWASP A02:2021 — sin la llave de cifrado de payloads, el build saldría con
  // credenciales y datos de cuentas legibles en DevTools. Fallar aquí deja en pie
  // el despliegue anterior de Vercel en vez de publicar uno sin cifrado.
  const entorno = loadEnv(mode, process.cwd(), 'VITE_');
  if (command === 'build' && !entorno.VITE_PAYLOAD_ENCRYPTION_KEY?.trim()) {
    throw new Error(
      'Falta VITE_PAYLOAD_ENCRYPTION_KEY (el mismo valor de PAYLOAD_ENCRYPTION_KEY del backend). Ver frontend/.env.example.'
    );
  }

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        // Evita configurar CORS en cada request durante desarrollo: todo lo
        // que empiece por /api se reenvía al backend de Sprint 1.
        '/api': 'http://localhost:4000',
        '/uploads': 'http://localhost:4000',
      },
    },
  };
});
