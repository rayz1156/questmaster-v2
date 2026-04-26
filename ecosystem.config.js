module.exports = {
  apps: [{
    name: 'questmaster-v2',
    script: 'node_modules/.bin/next',
    args: 'start -p 3004',
    cwd: '/var/www/questmaster-v2',
    env: {
      NODE_ENV: 'production',
    },
  }],
};
