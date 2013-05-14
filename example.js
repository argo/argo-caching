var argo = require('argo');
var cache = require('./cache');

var caching = cache({ ttl: 60 });

argo()
  .use(caching)
  .get('*', function(handle) {
    handle('request', function(env, next) {
      env.response.setHeader('Cache-Control', 'public, s-maxage=20');
      env.response.setHeader('Expires', '10');
      env.response.setHeader('Vary', 'X-Tada');
      env.response.setHeader('Content-Type', 'text/plain');
      env.response.body = 'Hello World!';
      next(env);
    });
  })
  .listen(3000);
