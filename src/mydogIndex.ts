
import Application, { I_mydog } from "./application";
import { ConnectorTcp } from "./connector/connectorProxyTcp";
import { ConnectorWs } from "./connector/connectorProxyWs";
import { I_connectorConstructor } from "./mydog"


let hasCreated = false;
let mydog: I_mydog = {} as any;

const packageJson = require("../package.json");
mydog.version = packageJson.version;
mydog.createApp = function () {
    if (hasCreated) {
        console.error("the app has already been created");
        return mydog.app;
    }
    hasCreated = true;
    mydog.app = new Application();
    return mydog.app;
};

mydog.connector = {
    "Tcp": ConnectorTcp as any as I_connectorConstructor,
    "Ws": ConnectorWs as any as I_connectorConstructor,
};


export = mydog