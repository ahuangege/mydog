/*
    {
        "name" : "player",
        "index" : "user_id",
        "field" : {
            "user_id": "number",
            "username": "string",
            "birthday": "time",
            "info": "json"
        }
    }
 */
var RedisObject = function (db, redis, name) {
    this.db = db;
    this.redis = redis;
    this.config = require('../../../config/redisTable/' + name + '.json');
};

RedisObject.prototype.load = function (index, cb) {
    if (!cb) {
        cb = function () {
        };
    }
    var self = this;
    var config = self.config;
    var objCon = {};
    objCon[config.index] = index;
    self.db.select(config.name, "*", objCon, function (err, res) {
        if (err || res.length === 0) {
            return cb(err);
        }
        res = res[0];
        var endValue = {};
        for (var key in res) {
            if (config.field[key] && res[key] !== null) {
                if (config.field[key] !== "time") {
                    endValue[key] = res[key];
                } else {
                    endValue[key] = new Date(res[key]).getTime();
                }
            }
        }
        if (Object.keys(endValue).length === 0) {
            return cb(null);
        }
        self.redis.hmset(config.name + ":" + index, endValue, cb);
    });
};

RedisObject.prototype.insert = function (index, value, cb) {
    if (!cb) {
        cb = function () {
        };
    }
    var config = this.config;
    var endValue = {};
    for (var key in value) {
        if (config.field[key] && value[key] != null) {
            if (config.field[key] === "json") {
                endValue[key] = JSON.stringify(value[key]);
            } else {
                endValue[key] = value[key];
            }
        }
    }
    if (Object.keys(endValue).length === 0) {
        return cb(null);
    }
    this.redis.hmset(config.name + ':' + index, endValue, cb);
};

RedisObject.prototype.update = function (index, value, cb) {
    this.insert(index, value, cb);
};

RedisObject.prototype.select = function (index, field, cb) {
    var config = this.config;
    if (field === "*") {
        field = [];
        for (var key in config.field) {
            field.push(key);
        }
    } else if (field.constructor !== Array) {
        field = [field];
    }

    this.redis.hmget(config.name + ":" + index, field, function (err, res) {
        if (err) {
            return cb(err);
        }
        var result = {};
        var type;
        for (var i = 0; i < field.length; i++) {
            type = config.field[field[i]];
            if (res[i] === null) {
                result[field[i]] = null;
            } else if (type === "number" || type === "time") {
                result[field[i]] = Number(res[i]);
            } else if (type === "json") {
                result[field[i]] = JSON.parse(res[i]);
            } else {
                result[field[i]] = res[i];
            }
        }
        cb(null, result);
    });
};

RedisObject.prototype.delete = function (index, cb) {
    this.redis.del(this.config.name + ":" + index, cb);
};

RedisObject.prototype.save = function (index, value, cb) {
    var config = this.config;
    var endValue = {};
    for (var key in value) {
        if (config.field[key]) {
            if (value[key] == null) {
                endValue[key] = null;
            } else if (config.field[key] === "json") {
                endValue[key] = JSON.stringify(value[key]);
            } else if (config.field[key] === "time") {
                endValue[key] = timeFormat(value[key]);
            } else {
                endValue[key] = value[key];
            }
        }
    }
    var objCon = {};
    objCon[config.index] = index;
    this.db.update(config.name, endValue, objCon, cb);
};


/*
    {
        "name": "friend",
        "key": "user_id",
        "field": "friend_user_id",
        "value": "status",
        "valueType": "number"
    }
*/
var RedisDictionary = function (db, redis, name) {
    this.db = db;
    this.redis = redis;
    this.config = require('../../../config/redisTable/' + name + '.json');
};

RedisDictionary.prototype.load = function (key, cb) {
    if (!cb) {
        cb = function () {
        };
    }
    var self = this;
    var config = self.config;
    var objCon = {};
    objCon[config.key] = key;
    self.db.select(config.name, "*", objCon, function (err, res) {
        if (err) {
            return cb(err);
        }
        var endValue = {};
        var value;
        for (var i = 0; i < res.length; i++) {
            value = res[i];
            if (value[config.value] === null) {
                continue;
            } else if (config.valueType !== "time") {
                endValue[value[config.field]] = value[config.value];
            } else {
                endValue[value[config.field]] = new Date(value[config.value]).getTime();
            }
        }
        if (Object.keys(endValue).length === 0) {
            return cb(null);
        }
        self.redis.hmset(config.name + ":" + key, endValue, cb);
    });
};

RedisDictionary.prototype.insert = function (key, field, value, cb) {
    if (!cb) {
        cb = function () {
        };
    }
    var config = this.config;
    if (value === null) {
        return cb(null);
    }
    if (config.valueType === "json") {
        value = JSON.stringify(value);
    }
    this.redis.hset(config.name + ':' + key, field, value, cb);
};

RedisDictionary.prototype.update = function (key, field, value, cb) {
    this.insert(key, field, value, cb);
};

RedisDictionary.prototype.select = function (key, field, cb) {
    var self = this;
    var config = self.config;
    if (field === "*") {
        self.redis.hgetall(config.name + ":" + key, function (err, res) {
            if (err) {
                return cb(err);
            }
            for (var key in res) {
                if (res[key] === null) {
                    res[key] = null;
                } else if (config.valueType === "json") {
                    res[key] = JSON.parse(res[key]);
                } else if (config.valueType === "number" || config.valueType === "time") {
                    res[key] = Number(res[key]);
                }
            }
            cb(err, res);
        })
    } else if (field.constructor !== Array) {
        self.redis.hget(config.name + ":" + key, field, function (err, res) {
            if (err || res === null) {
                return cb(err, null);
            }
            if (res === null) {
                res = null;
            } else if (config.valueType === "json") {
                res = JSON.parse(res);
            } else if (config.valueType === "number" || config.valueType === "time") {
                res = Number(res);
            }
            cb(err, res);
        });
    } else {
        self.redis.hmget(config.name + ":" + key, field, function (err, res) {
            if (err) {
                return cb(err);
            }
            var result = {};
            for (var i = 0; i < res.length; i++) {
                if (res[i] === null) {
                    result[field[i]] = null;
                } else if (config.valueType === "json") {
                    result[field[i]] = JSON.parse(res[i]);
                } else if (config.valueType === "number" || config.valueType === "time") {
                    result[field[i]] = Number(res[i]);
                } else {
                    result[field[i]] = res[i];
                }
            }
            cb(err, result);
        });
    }
};

RedisDictionary.prototype.delete = function (key, field, cb) {
    this.redis.hdel(this.config.name + ":" + key, field, cb)
};

RedisDictionary.prototype.deleteAll = function (key, cb) {
    this.redis.del(this.config.name + ":" + key, cb);
};

RedisDictionary.prototype.save = function (key, field, value, cb) {
    if (!cb) {
        cb = function () {
        };
    }
    var config = this.config;
    var endValue = {};
    if (value == null) {
        endValue[config.value] = null;
    } else if (config.valueType === "json") {
        endValue[config.value] = JSON.stringify(value);
    } else if (config.valueType === "time") {
        endValue[config.value] = timeFormat(value);
    } else {
        endValue[config.value] = value;
    }
    var objCon = {};
    objCon[config.key] = key;
    objCon[config.field] = field;
    this.db.update(config.name, endValue, objCon, cb);
};


function timeFormat(date, fmt) {
    fmt = fmt || "yyyy-MM-dd hh:mm:ss";
    date = new Date(date);
    var o = {
        "M+": date.getMonth() + 1,               //月份
        "d+": date.getDate(),                    //日
        "h+": date.getHours(),                   //小时
        "m+": date.getMinutes(),                 //分
        "s+": date.getSeconds(),                 //秒
        "S": date.getMilliseconds()             //毫秒
    };
    if (/(y+)/.test(fmt)) {
        fmt = fmt.replace(RegExp.$1, (date.getFullYear() + "").substr(4 - RegExp.$1.length));
    }
    for (var k in o) {
        if (new RegExp("(" + k + ")").test(fmt)) {
            fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
        }
    }
    return fmt;
}


exports.createObject = function (db, redis, name) {
    return new RedisObject(db, redis, name);
};

exports.createDictionary = function (db, redis, name) {
    return new RedisDictionary(db, redis, name);
};

