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

  var authorizationHeader = env.request.headers['authorization'];
  var cookieHeader = env.request.headers['cookie'];

  if (authorizationHeader || cookieHeader) {
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
  if (requestCacheControlHeader) {
    var requestCacheControl = cacheControl(requestCacheControlHeader, 'request');
    if (requestCacheControl.noCache || requestCacheControl.noStore) {
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
      var pipeline = env.pipeline('cache:error');
      if (pipeline) {
        pipeline.siphon(env, next);
      } else {
        next(env);
      }
      return;
    }

    if (!val || !val.entries) {
      env.cache.lookup = true;
      var pipeline = env.pipeline('cache:miss');
      if (pipeline) {
        pipeline.siphon(env, next);
      } else {
        next(env);
      }
    } else {
      var match = varyMatch(val.entries, env, next);

      if (!match) {
        //env.cache.pass = false;
        //env.cache.cacheable = false;
        env.cache.lookup = true;
        var pipeline = env.pipeline('cache:miss');
        if (pipeline) {
          pipeline.siphon(env, next);
        } else {
          next(env);
        }
        return;
      }

      var env1 = util._extend({}, env);
      env1.response = new (require('http').ServerResponse)(env.request);
      Object.keys(match.response.headers).forEach(function(name) {
        env1.response.setHeader(name, match.response.headers[name]);
      });
      env1.response.body = match.body;

      var expires = CachingRules._calculateExpires(env1);
      var dateHeader = match.response.headers['Date'];
      var date = new Date(dateHeader);
      var age = match.response.headers['age'] || 0;
      var responseTime = env.cache.responseTime = Date.now();
      var receivedAge = Math.max(responseTime - date, age) || 0;

      var initialAge = receivedAge + (responseTime - env.cache.requestTime);
      var residentTime = Date.now() - responseTime;

      match.response.headers['Age'] = Math.round((initialAge + residentTime) / 1000);

      if (match.response.headers['Age'] >= expires) {
        env.cache.remove(env.cache.key, function(err) {
          env.cache.pass = false;
          env.cache.cacheable = true;
          env.cache.lookup = true;
          var pipeline = env.pipeline('cache:miss');
          if (pipeline) {
            pipeline.siphon(env, next);
          } else {
            next(env);
          }
        });
        return;
      }

      //env.cache.value = val;

      Object.keys(match.response.headers).forEach(function(header) {
        env.response.setHeader(header, match.response.headers[header]);
      });

      env.response.body = match.body;
      env.response.setHeader('X-Cache-Hit', 'true');
      env.cache.pass = true;

      env.argo.bypassRoute = true;

      var pipeline = env.pipeline('cache:hit');
      if (pipeline) {
        pipeline.siphon(env, next);
      } else {
        next(env);
      }
    }
  });
};

function varyMatch(entries, env, next) {
  var idx = varyMatchIndexOf(entries, env);
  return !!~idx ? entries[idx] : null;
}

function varyMatchIndexOf(entries, env, next) {
  var idx = -1;
  var found = false;
  var stars = [];
  var varies = [];
  var other = [];

  // TODO: Sort entries by Vary... *, Vary headers, no Vary header
  entries.forEach(function(entry) {
    var vary = null;
    Object.keys(entry.response.headers).forEach(function(k) {
      if (k.toLowerCase() === 'vary') {
        vary = entry.response.headers[k];
      }
    });

    if (!vary) {
      other.push(entry);
    } else if (vary === '*') {
      stars.push(entry);
    } else {
      varies.push(entry);
      //var headers = vary.replace(/\s/g, '').split(',').map(function(n) { return n.toLowerCase(); });
    }
  });

  var sorted = stars.concat(varies, other);

  for (var i = 0, len = sorted.length; i < len; i++) {
    if (found) continue;

    var match = sorted[i];
    var vary = match.response.headers['Vary'];

    if (vary) {
      var headers = vary.replace(/\s/g, '').split(',').map(function(n) { return n.toLowerCase(); });
      var verified = true;
      headers.forEach(function(headerName) {
        var headerValue = env.request.headers[headerName];
        var requestHeader = match.request.headers[headerName];
        if (headerValue && requestHeader && headerValue !== requestHeader) {
          verified = false;
        }
      });

      if (verified) {
        idx = i;
        found = true;
      }
      
      /*if (!verified) {
        env.cache.pass = false;
        env.cache.cacheable = false;
        env.cache.lookup = true;
        var pipeline = env.pipeline('cache:miss');
        if (pipeline) {
          pipeline.siphon(env, next);
        } else {
          next(env);
        }
        returned = true;
        return;
      } else {
        ix = i;
      }*/
    } else {
      idx = i;
      found = true;
    }
  };

  return idx;
}

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

  if (!env.cache.cacheable) {
    env.cache.get(env.cache.key, function(err, val) {
      if (!val) return;

      var match = varyMatchIndexOf(val.entries, env, next);
      
      val.entries.splice(match, 1);

      if (!val.entries.length) {
        env.cache.remove(env.cache.key, function(err) {
          next(env);
        });
      } else {
        env.cache.put(env.cache.key, val, function(err) {
          next(env);
        });
      }
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

  if (newAge >= expires) {
    env.cache.cacheable = false;
    env.cache.pass = true;
    next(env);
    return;
  }

  env.response.setHeader('Age', newAge);

  var responseHeaders = {};

  if (env.response._headerNames) {
    Object.keys(env.response._headerNames).forEach(function(headerName) {
      if (disallowedHeaders.indexOf(headerName) == -1) {
        var val = env.response.getHeader(headerName);
        responseHeaders[env.response._headerNames[headerName]] = val;
      }
    });
  }  

  env.response.getBody(function(err, body) {
    var obj = {
      request: {
        headers: env.request.headers
      },
      response: {
        headers: responseHeaders
      },
      body: body
    
    };

    env.cache.get(env.cache.key, function(err, val) {
      if (val) {
        val = msgpack.decode(val);
        if (val && val.entries) {
          val.entries.push(obj);
        } else {
          val = { entries: [obj] };
        }
      } else {
        val = { entries: [obj] };
      }

      env.cache.put(env.cache.key, msgpack.encode(val), function(err) {
        next(env);
      });
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
