import Application from "./application";
import { I_connectorConstructor } from "./util/interfaceDefine";
import { ConnectorTcp } from "./connector/connectorProxyTcp";
import { ConnectorWs } from "./connector/connectorProxyWs";
import { ConnectorWss } from "./connector/connectorProxyWss";

interface I_mydog {
    version: string,
    createApp: () => Application,
    app: Application,
    connector: {
        connectorTcp: I_connectorConstructor,
        connectorWs: I_connectorConstructor,
        connectorWss: I_connectorConstructor,
    }
}


let hasCreated = false;
let mydog: I_mydog = {} as any;
mydog.version = require("../package.json").version;
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
    "connectorTcp": ConnectorTcp,
    "connectorWs": ConnectorWs,
    "connectorWss": ConnectorWss
};


export = mydog