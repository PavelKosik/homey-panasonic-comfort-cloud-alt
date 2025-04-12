"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MyDriver = void 0;
const homey_1 = __importDefault(require("homey"));
const panasonic_comfort_cloud_client_1 = require("panasonic-comfort-cloud-client");
const async_mutex_1 = require("async-mutex");
// From https://github.com/Magnusri/homey-panasonic-comfort-cloud-alt/blob/master/drivers/aircon/driver.ts
// This is a workaround for using node-fetch in Homey apps
// Ignore ts errors for this line
// @ts-ignore
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
class MyDriver extends homey_1.default.Driver {
    constructor() {
        super(...arguments);
        this.client = undefined;
        this.ignoreSettings = false;
        this.clientMutex = new async_mutex_1.Mutex();
    }
    // From https://github.com/Magnusri/homey-panasonic-comfort-cloud-alt/blob/master/drivers/aircon/driver.ts
    async getLatestAppVersion() {
        return new Promise((resolve, reject) => {
            let appleAppId = "1348640525"; // ID of the Panasonic Comfort Cloud app on the Apple App Store
            let url = "https://itunes.apple.com/lookup?id=" + appleAppId;
            // Fetch the app details from the Apple App Store using node-fetch
            fetch(url)
                .then(response => response.json())
                .then((data) => {
                if (data.resultCount == 0) {
                    reject("No app found with ID " + appleAppId);
                }
                else {
                    resolve(data.results[0].version);
                }
            })
                .catch(error => {
                reject(error);
            });
        });
    }
    async getClient() {
        if (this.client === undefined) {
            await this.clientMutex.runExclusive(async () => {
                if (this.client === undefined) {
                    let appVersion = "1.21.0";
                    try {
                        appVersion = await this.getLatestAppVersion();
                    }
                    catch (e) {
                        this.error('pcc app version query to itunes failed', e);
                    }
                    this.log('initializing client (' + appVersion + ')');
                    this.client = new panasonic_comfort_cloud_client_1.ComfortCloudClient(appVersion);
                    const username = this.homey.settings.get("username");
                    const password = this.homey.settings.get("password");
                    if (!username || !password) {
                        this.error('missing crdentials');
                        this.client = null;
                        throw new Error('Provide credentials in app settings.');
                    }
                    this.log('authenticating ' + username.replace("@", "[at]").replace(".", "[dot]"));
                    try {
                        await this.client.login(username, password);
                        this.log('authenticated');
                    }
                    catch (e) {
                        this.error('login failed:', e);
                        this.client = null;
                    }
                }
            });
        }
        ;
        if (this.client === null || this.client === undefined /*this shouldn't happen*/) {
            this.error('bad credentials');
            throw new Error('Authentication failed, edit credentials in app settings.');
        }
        return this.client;
    }
    async invokeClient(request) {
        while (true) {
            let client = await this.getClient();
            try {
                return await request(client);
            }
            catch (e) {
                if (e instanceof panasonic_comfort_cloud_client_1.TokenExpiredError) {
                    this.log('invokeClient TokenExpiredError');
                    this.resetClient();
                }
                else {
                    throw e;
                }
            }
        }
    }
    resetClient() {
        this.log('resetClient');
        this.client = undefined;
        this.getDevices()
            .forEach(device => device.fetchAndRestartTimer());
    }
    /**
     * Method to register all device specific action flow cards
     */
    async initActionCards() {
        const changeAirSwingLR = this.homey.flow.getActionCard('device-change-air-swing-leftright');
        changeAirSwingLR.registerRunListener(async (args) => {
            await args.device.postToService({ air_swing_lr: args.direction });
        });
        const changeAirSwingUD = this.homey.flow.getActionCard('device-change-air-swing-updown');
        changeAirSwingUD.registerRunListener(async (args) => {
            await args.device.postToService({ air_swing_ud: args.direction });
        });
        const changeEcoMode = this.homey.flow.getActionCard('device-change-eco-mode');
        changeEcoMode.registerRunListener(async (args) => {
            await args.device.postToService({ eco_mode: args.mode });
        });
        const changeFanSpeed = this.homey.flow.getActionCard('device-change-fan-speed');
        changeFanSpeed.registerRunListener(async (args) => {
            await args.device.postToService({ fan_speed: args.speed });
        });
        const changeOperationMode = this.homey.flow.getActionCard('device-change-operation-mode');
        changeOperationMode.registerRunListener(async (args) => {
            await args.device.postToService({ operation_mode: args.mode });
        });
    }
    /**
     * onInit is called when the driver is initialized.
     */
    async onInit() {
        this.homey.settings.on('set', (key) => {
            if (this.ignoreSettings || key == "log")
                return;
            this.log('settings.set');
            this.resetClient();
        });
        this.homey.settings.on('unset', (key) => {
            if (this.ignoreSettings || key == "log")
                return;
            this.log('settings.unset');
            this.resetClient();
        });
        // Register all device specific action flow cards
        await this.initActionCards();
        this.log('Driver has been initialized');
    }
    /**
     * onPairListDevices is called when a user is adding a device and the 'list_devices' view is called.
     * This should return an array with the data of devices that are available for pairing.
     */
    async onPairListDevices() {
        this.log('onPairListDevices');
        let devices = (await this.invokeClient(c => c.getGroups()))
            .flatMap(group => group.devices.map(device => ({
            name: group.name + ": " + device.name,
            data: {
                id: device.guid
            }
        })));
        // if (process.env.DEBUG === "1")
        //   devices = devices
        //     .concat([
        //       {
        //         name: "Mock group: Mock device",
        //         data: {
        //           id: "deadbeef"
        //         }
        //       }
        //     ]);
        this.log(devices);
        return devices;
    }
}
exports.MyDriver = MyDriver;
module.exports = MyDriver;
