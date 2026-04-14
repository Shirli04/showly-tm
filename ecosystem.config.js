module.exports = {
  apps: [
    {
      name: 'showly',
      script: 'server/src/server.js',
      cwd: '/var/www/showly',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
