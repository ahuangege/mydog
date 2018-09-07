var Package = require("../package.json");
var application = require("./application.js");
var hasCreated = false;

var mydog = module.exports = {};

mydog.version = Package.version;

mydog.createApp = function () {
    if(hasCreated){
        console.error("the app has already been created");
        return;
    }
    hasCreated = true;
    mydog.app = application;
    application.init();
    return application;
};