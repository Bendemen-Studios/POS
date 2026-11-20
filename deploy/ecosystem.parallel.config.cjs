/**
 * Parallel Bendemen POS processes.
 *
 * Expected directories:
 *   /var/www/bendemen-pos              -> current main (staging)
 *   /var/www/bendemen-pos-production  -> stable production branch
 *
 * Keep each app's .next build and environment files in its own directory.
 */
module.exports = {
  apps: [
    {
      name: "bendemen-pos",
      cwd: "/var/www/bendemen-pos-production",
      script: "npm",
      args: "start",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: "3000"
      }
    },
    {
      name: "bendemen-pos-staging",
      cwd: "/var/www/bendemen-pos",
      script: "npm",
      args: "start",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: "3001"
      }
    }
  ]
};
