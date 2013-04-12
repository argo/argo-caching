var Medea = require('medea');
var msgpack = require('msgpack-js');

var db = new Medea();

db.open(process.cwd() + '/data', function() {
  var cacheable = { food: 'muffins', expires: Date.now() + 3000 };
  db.put('fave', msgpack.encode(cacheable), function() {
    var timer;
    timer = setInterval(function() {
      db.get('fave', function(err, val) {
        var fave = msgpack.decode(val);
        if (fave.expires && fave.expires < Date.now()) {
          clearInterval(timer);
          db.remove('fave', function() {
            console.log('Expired!');
            db.close();
          });
          return;
        }

        console.log('Fetched:', fave);
      });
    }, 1000);
  });
});
