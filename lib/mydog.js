"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const application_1 = __importDefault(require("./application"));
const connectorProxyTcp_1 = require("./connector/connectorProxyTcp");
const connectorProxyWs_1 = require("./connector/connectorProxyWs");
const connectorProxyWss_1 = require("./connector/connectorProxyWss");
let hasCreated = false;
let mydog = {};
mydog.version = require("../package.json").version;
mydog.createApp = function () {
    if (hasCreated) {
        console.error("the app has already been created");
        return mydog.app;
    }
    hasCreated = true;
    mydog.app = new application_1.default();
    return mydog.app;
};
mydog.connector = {
    "connectorTcp": connectorProxyTcp_1.ConnectorTcp,
    "connectorWs": connectorProxyWs_1.ConnectorWs,
    "connectorWss": connectorProxyWss_1.ConnectorWss
};
module.exports = mydog;
