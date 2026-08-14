module.exports = {
  apps: [
    {
      name: 'bendemen-pos',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: '/var/www/bendemen-pos',
      instances: 1,
      autorestart: true,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};