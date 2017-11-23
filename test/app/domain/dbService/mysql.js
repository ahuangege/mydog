var mysql = require('mysql');

var sqlClient = function (config) {
    this.config = config;
    this.pool = mysql.createPool({
        host: this.config['host'],
        port: this.config['port'],
        user: this.config['user'],
        password: this.config['password'],
        database: this.config['database'],
        connectionLimit: this.config['limit']
    });
};

module.exports = sqlClient;

sqlClient.prototype.query = function (sql, args, cb) {
    this.pool.getConnection(function (err, connection) {
        if (err) {
            if (cb) {
                cb(err);
            }
        } else {
            connection.query(sql, args, function (err, res) {
                connection.release();
                if (cb) {
                    cb(err, res);
                }
            });
        }
    });
};

function getInsertSql(table, obj) {
    var sql = "insert into " + table + "(";
    var keyStr = "";
    var valueStr = "";
    var value;
    for (var p in obj) {
        keyStr += p + ",";
        value = obj[p];
        if (typeof value === "string") {
            valueStr += "'" + value + "',";
        } else {
            valueStr += value + ",";
        }
    }
    sql += keyStr.substring(0, keyStr.length - 1) + ") values(" + valueStr.substring(0, valueStr.length - 1) + ")";
    return sql;
}

sqlClient.prototype.insert = function (table, obj, cb) {
    this.query(getInsertSql(table, obj), null, cb);
};

function getUpdateSql(table, obj, objCon) {
    var sql = "update " + table + " set ";
    var updateStr = "";
    var whereStr = "";
    var value;
    var key;
    for (key in obj) {
        value = obj[key];
        updateStr += key + "=";
        if (typeof value === "string") {
            updateStr += "'" + value + "',";
        } else {
            updateStr += value + ",";
        }
    }
    for (key in objCon) {
        value = objCon[key];
        whereStr += key + "=";
        if (typeof value === "string") {
            whereStr += "'" + value + "' and ";
        } else {
            whereStr += value + " and ";
        }
    }
    sql += updateStr.substring(0, updateStr.length - 1) + " where " + whereStr.substring(0, whereStr.length - 4);
    return sql;
}

sqlClient.prototype.update = function (table, obj, objCon, cb) {
    this.query(getUpdateSql(table, obj, objCon), null, cb);
};

function getDeleteSql(table, objCon) {
    var sql = "delete from " + table + " where ";
    var key;
    var value;
    var whereStr = "";
    for (key in objCon) {
        value = objCon[key];
        whereStr += key + "=";
        if (typeof value === "string") {
            whereStr += "'" + value + "' and ";
        } else {
            whereStr += value + " and ";
        }
    }
    sql += whereStr.substring(0, whereStr.length - 4);
    return sql;
}

sqlClient.prototype.delete = function (table, objCon, cb) {
    this.query(getDeleteSql(table, objCon), null, cb);
};

function getSelectSql(table, field, objCon) {
    var sql = "select ";

    for (var i = 0; i < field.length; i++) {
        sql += field[i];
        if (i < field.length - 1) {
            sql += ",";
        }
    }

    sql += " from " + table;
    if (objCon) {
        sql += " where ";
        var key;
        var value;
        var whereStr = "";
        for (key in objCon) {
            value = objCon[key];
            whereStr += key + "=";
            if (typeof value === "string") {
                whereStr += "'" + value + "' and ";
            } else {
                whereStr += value + " and ";
            }
        }
        sql += whereStr.substring(0, whereStr.length - 4);
    }
    return sql;
}

sqlClient.prototype.select = function (table, field, objCon, cb) {
    this.query(getSelectSql(table, field, objCon), null, cb);
};