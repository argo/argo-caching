var argo = require('argo-server');
var cache = require('./cache');
var rules = require('./caching_rules');

var caching = cache({ ttl: 60 });

argo()
  .use(function(handle) {
    handle('response', rules.checkResponse);
  })
  .use(function(handle) {
    handle('request', function(env, next) {
      console.log(env.request.headers);
      console.log(env.request.url);
      next(env);
    });
  })
  /*.use(function(handle) {
    handle('response', function(env, next) {
      console.log(env.cache);
      if (env.cache.miss(env)) {
        env.response.getBody(function(err, body) {
          env.cache.put(env.request.url, body, function() {
            next(env);
          });
        });
      } else {
        next(env);
      }
    });
  })*/
  .use(caching)
  .use(function(handle) {
    handle('request', rules.generateKey);
  })
  .use(function(handle) {
    handle('request', rules.checkRequest);
  })
  .get('/long', function(handle) {
    handle('request', function(env, next) {
      if (env.cache.hit(env)) {
        console.log('cache hit');
        next(env);
        return;
      }

      console.log('cache miss');
      env.response.setHeader('Content-Type', 'text/plain');
      env.response.body = 'Hello World!';
      next(env);
    });
  })
  .listen(3000);
