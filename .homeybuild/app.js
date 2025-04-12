"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const homey_1 = __importDefault(require("homey"));
const hook_1 = __importDefault(require("./hook"));
class MyApp extends homey_1.default.App {
    constructor() {
        super(...arguments);
        this.logs = [];
        this.unhook = () => { };
    }
    async onInit() {
        this.unhook = (0, hook_1.default)((str) => {
            this.logs = this.logs.slice(-500).concat(str);
            this.homey.settings.set("log", this.logs.join(""));
        });
        this.log('MyApp has been initialized');
    }
    async onUninit() {
        this.unhook();
    }
}
module.exports = MyApp;
