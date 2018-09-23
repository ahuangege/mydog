"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var application_1 = __importDefault(require("./application"));
var Package = require("../package.json");
var hasCreated = false;
var mydog = {};
mydog.version = Package.version;
mydog.createApp = function () {
    if (hasCreated) {
        console.error("the app has already been created");
        return;
    }
    hasCreated = true;
    mydog.app = new application_1.default();
    return mydog.app;
};
exports.default = mydog;
