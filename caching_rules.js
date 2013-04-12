var util = require('util');
var msgpack = require('msgpack-js');
var cacheControl = require('./cache_control');

var CachingRules = function() {
};

CachingRules.prototype.checkRequest = function(env, next) {
  env.cache.requestTime = Date.now();

  if (['GET', 'HEAD'].indexOf(env.request.method) === -1) {
    env.cache.pass = true;
    next(env);
    return;
  }

  var pragma = env.request.headers['pragma'];
  if (pragma && pragma.toLowerCase() === 'no-cache') {
    env.cache.pass = true;
    next(env);
    return;
  }

  var requestCacheControlHeader = env.request.headers['cache-control'];
  var authorizationHeader = env.request.headers['authorization'];
  if (requestCacheControlHeader) {
    var requestCacheControl = cacheControl(requestCacheControlHeader, 'request');
    if (requestCacheControl.noCache || requestCacheControl.noStore || authorizationHeader) {
      env.cache.pass = true;
      next(env);
      return;
    }
  }

  env.cache.get(env.cache.key, function(err, val) {
    if (val) {
      val = msgpack.decode(val);
    }

    if (err) {
      env.cache.pass = true;
      next(env);
      return;
    }

    if (!val) {
      env.cache.fetch = true;
      next(env);
    } else {
      // TODO: Verify Vary headers.

      console.log('env body:', env.response.body);
      var env1 = util._extend({}, env);
      env1.response = new (require('http').ServerResponse)(env.request);
      Object.keys(val.headers).forEach(function(name) {
        env1.response.setHeader(name, val.headers[name]);
      });
      env1.response.body = val.body;
      console.log('env1 body:', env1.response.body);
      console.log('env body:', env.response.body);
      var expires = CachingRules._calculateExpires(env1);
      console.log(val.headers);
      var dateHeader = val.headers['Date'];
      var date = new Date(dateHeader);
      var age = val.headers['age'] || 0;
      var responseTime = env.cache.responseTime = Date.now();
      var receivedAge = Math.max(responseTime - date, age) || 0;
      console.log('calc:', responseTime - date);

      var initialAge = receivedAge + (responseTime - env.cache.requestTime);
      var residentTime = Date.now() - responseTime;

      val.headers['Age'] = Math.round((initialAge + residentTime) / 1000);

      console.log('expires1:', expires);
      if (val.headers['Age'] >= expires) {
        env.cache.remove(env.cache.key, function(err) {
          env.cache.pass = false;
          env.cache.cacheable = false;
          env.cache.fetch = true;
          next(env);
        });
        return;
      }

      //env.cache.value = val;

      Object.keys(val.headers).forEach(function(header) {
        env.response.setHeader(header, val.headers[header]);
      });

      env.response.body = val.body;
      env.response.setHeader('X-Cache-Hit', 'true');
      env.cache.pass = true;

      next(env);
    }
  });
};

CachingRules.prototype.checkResponse = function(env, next) {
  if (env.cache.pass) {
    next(env);
    return;
  }

  env.cache.cacheable = true;

  var disallowedHeaders = ['connection', 'keep-alive', 'proxy-authentication', 'proxy-authorization', 'te',
      'transfer-encoding', 'upgrade'];

  var varyHeader = env.response.getHeader('vary');
  var setCookieHeader = env.response.getHeader('set-cookie');
  if (varyHeader === '*' || setCookieHeader) {
    env.cache.cacheable = false;
  }

  var expires;

  if (env.cache.cacheable) {
    expires = CachingRules._calculateExpires(env);
  }

  console.log('is cacheable?', env.cache.cacheable);
  if (!env.cache.cacheable) {
    env.cache.remove(env.cache.key, function(err) {
      next(env);
    });
    return;
  }

  var dateHeader = env.response.getHeader('date');

  if (!dateHeader) {
    env.response.setHeader('Date', utcDate());
    dateHeader = env.response.getHeader('date');
  }

  var date = new Date(dateHeader);
  var age = env.response.getHeader('age') || 0;
  var responseTime = env.cache.responseTime = Date.now();
  var receivedAge = Math.max(responseTime - date, age) || 0;

  var initialAge = receivedAge + (responseTime - env.cache.requestTime);
  var residentTime = Date.now() - responseTime;
  var newAge = Math.round((initialAge + residentTime) / 1000);

  console.log('expires:', expires);
  if (newAge >= expires) {
    env.cache.cacheable = false;
    env.cache.pass = true;
    next(env);
    return;
  }

  env.response.setHeader('Age', newAge);

  var headers = {};

  if (env.response._headerNames) {
    Object.keys(env.response._headerNames).forEach(function(headerName) {
      if (disallowedHeaders.indexOf(headerName) == -1) {
        var val = env.response.getHeader(headerName);
        headers[env.response._headerNames[headerName]] = val;
      }
    });
  }  

  env.response.getBody(function(err, body) {
    var obj = {
      headers: headers,
      body: body
    
    };

    env.cache.put(env.cache.key, msgpack.encode(obj), function(err) {
      next(env);
    });
  });
};

CachingRules.prototype.generateKey = function(env, next) {
  var host = env.request.headers['host'];
  var url = env.request.url;
  var key = host + url;

  env.cache.key = key;
  next(env);
};

CachingRules._calculateExpires = function(env) {
  var cacheableStatusCodes = [200, 203, /*206*/, 300, 301, 410]; // for default ttl

  var expiresHeader = env.response.getHeader('expires');
  var pragmaHeader = env.response.getHeader('pragma');
  var cacheControlHeader = env.response.getHeader('cache-control');
  
  var cacheControlValue = cacheControl(cacheControlHeader);

  if (cacheControlValue.sharedMaxAge) {
    expires = cacheControlValue.sharedMaxAge;
  } else if (cacheControlValue.maxAge) {
    expires = cacheControl.maxAge;
  } else if (expiresHeader) {
    expires = expiresHeader;
  } else if (cacheableStatusCodes.indexOf(env.response.statusCode) !== -1 
      && (!pragmaHeader || pragmaHeader.toLowerCase() !== 'no-cache') && !cacheControl.noCache
      && !cacheControl.noStore) {
    expires = env.cache.ttl;
  } else {
    env.cache.cacheable = false;
  }

  return expires;
};

var dateCache;
function utcDate() {
  if (!dateCache) {
    var d = new Date();
    dateCache = d.toUTCString();
    setTimeout(function() {
      dateCache = undefined;
    }, 1000 - d.getMilliseconds());
  }
  return dateCache;
}

module.exports = new CachingRules();
