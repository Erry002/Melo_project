module.exports = {
  apps: [
    {
      name: 'meluccio',
      script: '../server.js',
      cwd: __dirname,
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
        NODE_OPTIONS: '--max-old-space-size=350 --gc-interval=100000'
      }
    },
    {
      name: 'ngrok',
      script: '/usr/local/bin/ngrok',
      args: ['start', '--all', '--config', '/home/erry002/.config/ngrok/ngrok.yml'],
      interpreter: 'none',
      cwd: __dirname,
      autorestart: true,
      watch: false,
      // Aggiungi un delay alla riavvio per evitare picchi di risorse
      restart_delay: 5000
    }
  ]
};
