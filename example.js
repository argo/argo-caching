var argo = require('argo-server');
var cache = require('./cache');
var rules = require('./caching_rules');

var caching = cache({ ttl: 60 });

argo()
  .use(caching)
  .use(function(handle) {
    handle('request', rules.generateKey);
  })
  .use(function(handle) {
    handle('request', rules.checkRequest);
    handle('response', { sink: true }, rules.checkResponse);
  })
  .route('*', { methods: ['GET'] }, function(handle) {
    handle('request', function(env, next) {
      if (env.cache && env.cache.hit(env)) {
        console.log('cache hit');
        next(env);
        return;
      }

      console.log('cache miss');
      env.response.setHeader('Cache-Control', 'public, s-maxage=20');
      env.response.setHeader('Expires', '10');
      env.response.setHeader('Content-Type', 'text/plain');
      env.response.body = 'Hello World!';
      next(env);
    });
  })
  .listen(3000);
