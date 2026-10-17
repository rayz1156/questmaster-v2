module.exports = {
  apps: [{
    name: 'kuizen-lms',
    script: 'node_modules/.bin/next',
    args: 'start -p 3011',
    cwd: '/var/www/kuizen-lms',
    env: {
      NODE_ENV: 'production',
    },
  }],
};
