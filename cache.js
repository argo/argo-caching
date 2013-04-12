var Medea = require('medea');

var Cache = function(medea) {
  this.open = Medea.prototype.open.bind(medea);
  this.get = Medea.prototype.get.bind(medea);
  this.put = Medea.prototype.put.bind(medea);
  this.remove = Medea.prototype.remove.bind(medea);
};

Cache.prototype.hit = function(env) {
  return env.response.getHeader('X-Cache-Hit') === 'true';
};

Cache.prototype.miss = function(env) {
  return env.response.getHeader('X-Cache-Hit') !== 'true';
};

/*function fetchFromCache(env, next) {
  env.cache.get(env.request.url, function(err, val) {
    if (val) {
      env.response.body = val.toString();
      env.response.setHeader('X-Cache-Hit', 'true');
      env.isCacheHit = true;
      next(env);
    } else {
      next(env);
    }
  });
}*/


var isOpen = false;
module.exports = function(options) {
  options = options || {};
  dirname = options.dirname || process.cwd() + '/data';

  var medea = new Medea(options);

  return function(handle) {
    handle('request', function(env, next) {
      env.cache = new Cache(medea);
      env.cache.ttl = options.ttl;

      if (!isOpen) {
        medea.open(dirname, options, function(err) {
          isOpen = true;
          next(env);
          //fetchFromCache(env, next);
        });
      } else {
        next(env);
        //fetchFromCache(env, next);
      }
    });

    /*handle('response', function(env, next) {
      if (env.response.getHeader('X-Cache-Hit')) {
        env.response.removeHeader('X-Cache-Hit');
      }
      if (env.response.statusCode === 200 || env.response.statusCode === 201) {
        env.response.getBody(function(err, body) {
          env.cache.put(env.request.url, body);
          next(env);
        });
      } else {
        next(env);
      }
    });*/
  };
};
