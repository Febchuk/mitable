// Type declarations for electron-log submodules
declare module "electron-log/preload" {
  import { LogFunctions } from "electron-log";
  const log: LogFunctions;
  export default log;
}

declare module "electron-log/main" {
  import log from "electron-log";
  export default log;
  export * from "electron-log";
}

declare module "electron-log/renderer" {
  import { LogFunctions } from "electron-log";
  const log: LogFunctions;
  export default log;
}
