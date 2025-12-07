const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const HOME_DIR = process.env.HOME || path.resolve(REPO_ROOT, '..');
const NGROK_CONFIG = path.join(HOME_DIR, '.config', 'ngrok', 'ngrok.yml');

module.exports = {
  apps: [
    {
      name: 'meluccio',
      script: path.join(REPO_ROOT, 'server.js'),
      cwd: REPO_ROOT,
      autorestart: true,
      watch: false,
      // Limiti di memoria più conservativi per Raspberry Pi 3B+
      max_memory_restart: '350M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        // Limita il pool di thread per risparmiare memoria
        UV_THREADPOOL_SIZE: '2',
        // Limita l'uso di memoria per il garbage collector di Node.js
        NODE_OPTIONS: '--max-old-space-size=350'
      }
    },
    {
      name: 'ngrok',
      script: '/usr/local/bin/ngrok',
      args: ['start', '--all', '--config', NGROK_CONFIG],
      interpreter: 'none',
      cwd: __dirname,
      autorestart: true,
      watch: false,
      // Aggiungi un delay alla riavvio per evitare picchi di risorse
      restart_delay: 5000
    }
  ]
};
