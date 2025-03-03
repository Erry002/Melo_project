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
    name: 'ngrok',
    script: '/usr/local/bin/ngrok',
    args: ['start', '--all', '--config', '/home/erry002/.config/ngrok/ngrok.yml'],
    interpreter: 'none',
    cwd: __dirname,
    autorestart: true,
    watch: false
  }]
}
