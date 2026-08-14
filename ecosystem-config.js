module.exports = {
  apps: [
    {
      name: 'bendemen-pos',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: '/var/www/bendemen-pos',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};