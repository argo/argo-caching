var argo = require('argo');
var cache = require('./cache');

var caching = cache({ ttl: 60 });

argo()
  .use(caching)
  .use(function(handle) {
    handle('cache:miss', function(env, next) {
      console.log('cache miss');
      next(env);
    });

    handle('cache:hit', function(env, next) {
      console.log('cache hit');
      next(env);
    });
  })
  .use(function(handle) {
    handle('request', function(env, next) {
      if (['GET', 'HEAD'].indexOf(env.request.method) === -1) {
        return next(env);
      }

      env.response.setHeader('Cache-Control', 'public, s-maxage=20');
      env.response.setHeader('Expires', '10');
      env.response.setHeader('Vary', 'X-Tada, Hello');
      env.response.setHeader('Content-Type', 'text/plain');
      env.response.body = 'Hello World!';

      next(env);
    });
  })
  .listen(3000);
