import Application from "./application";
let Package = require("../package.json");

let hasCreated = false;
let mydog: { version: string, createApp: () => Application | undefined, app: Application } = {} as any;
mydog.version = Package.version;
mydog.createApp = function () {
    if (hasCreated) {
        console.error("the app has already been created");
        return;
    }
    hasCreated = true;
    mydog.app = new Application();
    return mydog.app;
};

export default mydog