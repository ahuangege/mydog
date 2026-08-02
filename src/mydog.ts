import packageJson from "../package.json";
import Application, { I_mydog } from "./application";
import { ConnectorTcp } from "./connector/connectorProxyTcp";
import { ConnectorWs } from "./connector/connectorProxyWs";


let hasCreated = false;
let mydog: I_mydog = {} as any;
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
    "Tcp": ConnectorTcp,
    "Ws": ConnectorWs,
};


export = mydog