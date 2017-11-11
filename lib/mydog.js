var Package = require("../package.json");
var application = require("./application.js");


var mydog = module.exports = {};

mydog.version = Package.version;

mydog.createApp = function () {
    mydog.app = application;
    application.init();
    return application;
};