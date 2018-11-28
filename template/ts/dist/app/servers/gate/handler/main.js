"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function default_1(app) {
    return new Handler(app);
}
exports.default = default_1;
var Handler = /** @class */ (function () {
    function Handler(app) {
        this.app = app;
    }
    Handler.prototype.login = function (msg, session, next) {
        var connectors = this.app.getServersByType("connector");
        var min = 99999;
        var index = 0;
        for (var i = 0; i < connectors.length; i++) {
            var num = connectors[i].userNum || 0;
            if (num < min) {
                min = num;
                index = i;
            }
        }
        var data = {
            "host": connectors[index].host,
            "port": connectors[index].port,
            "chat": this.app.getServersByType("chat")
        };
        next(data);
    };
    return Handler;
}());
