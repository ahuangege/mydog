var redis = require('redis');

var redisClient = function (config) {
    this.config = config;
    this.instance = redis.createClient(config);
    this.instance.on("error", function (err) {
        console.error("redis err : " + err);
    });
};
module.exports = redisClient;



redisClient.prototype.del = function (key, cb) {
    this.instance.del(key, cb);
};

redisClient.prototype.set = function (key, val, cb) {
    this.instance.set(key, val, cb);
};

redisClient.prototype.get = function (key, cb) {
    this.instance.get(key, cb);
};


redisClient.prototype.hset = function (key, cb) {
    this.instance.get(key, cb);
};