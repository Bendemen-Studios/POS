module.exports = {
  apps: [
    {
      name: "bendemen-pos",
      script: "node_modules/.bin/next",
      args: "start",
      instances: "max",
      exec_mode: "cluster",
      // Hiermee vertel je PM2 dat hij het .env bestand automatisch moet inlezen
      env_file: ".env",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    }
  ]
};