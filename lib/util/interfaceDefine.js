"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 内部框架日志级别
 */
var loggerType;
(function (loggerType) {
    loggerType["debug"] = "debug";
    loggerType["info"] = "info";
    loggerType["warn"] = "warn";
    loggerType["error"] = "error";
})(loggerType = exports.loggerType || (exports.loggerType = {}));
/**
 * 组件名
 */
var componentName;
(function (componentName) {
    componentName["master"] = "master";
    componentName["monitor"] = "monitor";
    componentName["frontendServer"] = "frontendServer";
    componentName["backendServer"] = "backendServer";
    componentName["remoteFrontend"] = "remoteFrontend";
    componentName["remoteBackend"] = "remoteBackend";
    componentName["rpcServer"] = "rpcServer";
    componentName["rpcService"] = "rpcService";
})(componentName = exports.componentName || (exports.componentName = {}));
