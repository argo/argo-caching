module.exports = function(handle) {
  handle('request', function(env, next) {
    if (env.request.method !== 'PURGE') {
      return next(env);
    }

    var clientAddress = env.request.connection.remoteAddress;

    if (!!~['0.0.0.0', '127.0.0.1'].indexOf(clientAddress)) {
      return env.cache.remove(env.cache.key, function() {
        env.response.writeHead(200);
        env.response.end('Purge successful!');
      });
    } else {
      env.response.writeHead(504);
      env.response.end();
      return;
    }

    next(env);
  });
};
