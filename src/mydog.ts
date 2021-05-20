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
        Tcp: I_connectorConstructor,
        Ws: I_connectorConstructor,
        Wss: I_connectorConstructor,
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
    "Tcp": ConnectorTcp,
    "Ws": ConnectorWs,
    "Wss": ConnectorWss
};


export = mydog