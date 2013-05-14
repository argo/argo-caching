var Medea = require('medea');
var rules = require('./caching_rules');

var Cache = function(db) {
  this.open = Medea.prototype.open.bind(db);
  this.get = Medea.prototype.get.bind(db);
  this.put = Medea.prototype.put.bind(db);
  this.remove = Medea.prototype.remove.bind(db);
};

var options;
var db;
var isOpen = false;

module.exports = function(opts) {
  options = opts || {};
  dirname = options.dirname || process.cwd() + '/data';
  db = new Medea(options);

  return { package: setupPackage };
};

var setupPackage = function(argo) {
  return {
    name: 'Argo HTTP Caching',
    install: function() {
      argo
        .use(function(handle) {
          handle('request', function(env, next) {
            env.cache = new Cache(db);
            env.cache.ttl = options.ttl;

            if (!isOpen) {
              db.open(dirname, options, function(err) {
                isOpen = true;
                next(env);
              });
            } else {
              next(env);
            }
          });
        })
        .use(function(handle) {
          handle('request', rules.generateKey);
        })
        .use(function(handle) {
          handle('request', rules.checkRequest);
          handle('response', { sink: true }, rules.checkResponse);
        });
    }
  };
};
