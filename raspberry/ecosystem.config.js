module.exports = {
  apps: [{
    name: 'meluccio',
    script: '../server.js',
    cwd: __dirname,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    }
  },
  {
    name: 'ngrok-manager',
    script: './ngrok-manager.sh',
    cwd: __dirname,
    autorestart: true,
    watch: false
  }]
}
