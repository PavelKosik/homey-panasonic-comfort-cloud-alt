"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MyDevice = void 0;
const homey_1 = __importDefault(require("homey"));
const panasonic_comfort_cloud_client_1 = require("panasonic-comfort-cloud-client");
function getParam(value, transform) {
    if (value === undefined)
        return undefined;
    return transform(value);
}
class MyDevice extends homey_1.default.Device {
    constructor() {
        super(...arguments);
        this.id = this.getData().id;
        this.driver = this.driver;
        this.timer = null;
        this.alwaysOn = false;
    }
    async setCap(name, value) {
        // Try adding the capability if it does not exist
        if (!this.hasCapability(name)) {
            this.addCapability(name);
        }
        let current = this.getCapabilityValue(name);
        if (value == current)
            return;
        this.log("setCapabilityValue(" + name + ", " + value + ")");
        await this.setCapabilityValue(name, value);
    }
    // Getting the timezone offset in minutes
    getOffset(timeZone = 'UTC', date = new Date()) {
        const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
        const tzDate = new Date(date.toLocaleString('en-US', { timeZone }));
        return (tzDate.getTime() - utcDate.getTime()) / 6e4;
    }
    // Converting the offset minutes to hours in the format "+01:00"
    minutesToHours(minutes) {
        const positive = minutes >= 0;
        minutes = Math.abs(minutes);
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${positive ? '+' : '-'}${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    }
    // Fetch the last hour's power consumption in watts
    // This will register the consumption with one hour delay, as the last hour is not complete yet.
    async fetchLastHourWattsConsumption(client, device) {
        var _a;
        if (!device)
            return;
        // Get the timezone offset in the format "+01:00" with Europe/Oslo as default (Change this to some other default?)
        let timeZone = this.minutesToHours(this.getOffset(this.homey.clock.getTimezone() || 'Europe/Oslo')) || '+01:00';
        // Get today's history data for the device
        let historyData = await client.getDeviceHistoryData(device.guid, new Date(), 0, timeZone);
        // Filter out the -255 values, which are used to indicate hours that has not passed yet in the current day
        let historyWithData = historyData.historyDataList.filter((i) => i.consumption != -255);
        // Get the consumption from the second last hour (the last hour is not complete yet)
        let consumption = (_a = historyWithData === null || historyWithData === void 0 ? void 0 : historyWithData[(historyWithData === null || historyWithData === void 0 ? void 0 : historyWithData.length) - 2]) === null || _a === void 0 ? void 0 : _a.consumption;
        // Set the measure_avg_consumption_wh capability to the consumption in watts instead of kilowatts
        this.setCap('measure_avg_consumption_wh', consumption * 1000);
    }
    async fetchFromService(forced) {
        // this.log("fetchFromService("+forced+")");
        let device;
        try {
            device = await this.driver.invokeClient(async (c) => {
                let device = await c.getDevice(this.id);
                // Fetch and set the last hour's power consumption
                await this.fetchLastHourWattsConsumption(c, device);
                return device;
            });
            //TODO: the mock device throws 403 above
            if (!device)
                throw new Error("Device " + this.id + " not found.");
        }
        catch (e) {
            this.error("getDevice failed:", e);
            if (e instanceof Error)
                await this.setWarning(e.message);
            throw e;
        }
        await this.unsetWarning();
        /* Values for airSwingLR from the device
         * The value for RightMid is 5. The Enum thinks it is 3, so we map it to 3 until the enum in the library is fixed.
         * Right: 1
         * RightMid: 5
         * Mid: 2
         * LeftMid: 4
         * Left: 0
        */
        await this.setCap('onoff', device.operate == panasonic_comfort_cloud_client_1.Power.On);
        await this.setCap('measure_temperature', device.insideTemperature);
        await this.setCap('measure_temperature_outside', device.outTemperature);
        await this.setCap('target_temperature', device.temperatureSet);
        await this.setCap('operation_mode', panasonic_comfort_cloud_client_1.OperationMode[device.operationMode]);
        await this.setCap('eco_mode', panasonic_comfort_cloud_client_1.EcoMode[device.ecoMode]);
        await this.setCap('air_swing_lr', panasonic_comfort_cloud_client_1.AirSwingLR[device.airSwingLR == 5 ? 3 : device.airSwingLR]); // See comment above
        await this.setCap('air_swing_ud', panasonic_comfort_cloud_client_1.AirSwingUD[device.airSwingUD]);
        await this.setCap('fan_auto_mode', panasonic_comfort_cloud_client_1.FanAutoMode[device.fanAutoMode]);
        await this.setCap('fan_speed', panasonic_comfort_cloud_client_1.FanSpeed[device.fanSpeed]);
        await this.setCap('nanoe_mode', panasonic_comfort_cloud_client_1.NanoeMode[device.nanoe]);
    }
    async fetchAndRestartTimer() {
        if (this.timer)
            this.homey.clearInterval(this.timer);
        await this.fetchFromService(true);
        this.timer = this.homey.setInterval(() => this.fetchFromService(false), 60000);
    }
    async postToService(values) {
        this.log('postToService:', values);
        if (this.alwaysOn && values['onoff'] == panasonic_comfort_cloud_client_1.Power.Off) {
            // alwaysOn=true, so block transmitting Power.Off to device
            this.log("  always on set -> block power off");
            return;
        }
        let params = {
            operate: getParam(values['onoff'], v => v ? panasonic_comfort_cloud_client_1.Power.On : panasonic_comfort_cloud_client_1.Power.Off),
            temperatureSet: values['target_temperature'],
            operationMode: getParam(values['operation_mode'], v => panasonic_comfort_cloud_client_1.OperationMode[v]),
            ecoMode: getParam(values['eco_mode'], v => panasonic_comfort_cloud_client_1.EcoMode[v]),
            airSwingLR: getParam(values['air_swing_lr'], v => panasonic_comfort_cloud_client_1.AirSwingLR[v] == 3 ? 5 : panasonic_comfort_cloud_client_1.AirSwingLR[v]),
            airSwingUD: getParam(values['air_swing_ud'], v => panasonic_comfort_cloud_client_1.AirSwingUD[v]),
            fanAutoMode: getParam(values['fan_auto_mode'], v => panasonic_comfort_cloud_client_1.FanAutoMode[v]),
            fanSpeed: getParam(values['fan_speed'], v => panasonic_comfort_cloud_client_1.FanSpeed[v]),
            actualNanoe: getParam(values['nanoe_mode'], v => panasonic_comfort_cloud_client_1.NanoeMode[v])
        };
        try {
            await this.driver.invokeClient(c => c.setParameters(this.id, params));
        }
        catch (e) {
            this.error("setParameters failed:", e);
            if (e instanceof Error)
                await this.setWarning(e.message);
            throw e;
        }
        await this.fetchAndRestartTimer();
    }
    /**
     * Method to collect all our action flow cards
     */
    async initActionCards() {
        const changeAirSwingUD = this.homey.flow.getActionCard('change-air-swing-updown');
        changeAirSwingUD.registerRunListener(async (args) => {
            await this.postToService({ air_swing_ud: args.direction });
        });
        const changeAirSwingLR = this.homey.flow.getActionCard('change-air-swing-leftright');
        changeAirSwingLR.registerRunListener(async (args) => {
            await this.postToService({ air_swing_lr: args.direction });
        });
        const changeOperationMode = this.homey.flow.getActionCard('change-operation-mode');
        changeOperationMode.registerRunListener(async (args) => {
            await this.postToService({ operation_mode: args.mode });
        });
        const changeFanSpeed = this.homey.flow.getActionCard('change-fan-speed');
        changeFanSpeed.registerRunListener(async (args) => {
            await this.postToService({ fan_speed: args.speed });
        });
        const changeEcoMode = this.homey.flow.getActionCard('change-eco-mode');
        changeEcoMode.registerRunListener(async (args) => {
            await this.postToService({ eco_mode: args.mode });
        });
    }
    /**
     * onInit is called when the device is initialized.
     */
    async onInit() {
        this.registerMultipleCapabilityListener([
            'onoff',
            'target_temperature',
            'operation_mode',
            'eco_mode',
            'air_swing_lr',
            'air_swing_ud',
            'fan_auto_mode',
            'fan_speed',
            'nanoe_mode'
        ], values => this.postToService(values), 3000);
        try {
            await this.fetchAndRestartTimer();
        }
        catch (e) {
            if (e instanceof Error)
                await this.setWarning(e.message);
            else
                throw e;
        }
        // TO BE DEPRECATED: Do not initialize action cards from the device (since devices::onInit is called for every device) but from drivers::onInit
        await this.initActionCards();
        const settings = this.getSettings();
        this.alwaysOn = settings.alwayson;
        this.log("Device '" + this.id + "' has been initialized");
    }
    /**
     * onAdded is called when the user adds the device, called just after pairing.
     */
    async onAdded() {
        this.log('Device has been added');
    }
    /**
     * onSettings is called when the user updates the device's settings.
     * @param {object} event the onSettings event data
     * @param {object} event.oldSettings The old settings object
     * @param {object} event.newSettings The new settings object
     * @param {string[]} event.changedKeys An array of keys changed since the previous version
     * @returns {Promise<string|void>} return a custom message that will be displayed
     */
    async onSettings({ oldSettings, newSettings, changedKeys, }) {
        this.log("Device settings changed: " + changedKeys.toString());
        if (changedKeys.toString().includes('alwayson')) {
            this.alwaysOn = Boolean(newSettings.alwayson);
            this.log("    alwayson changed to: ", this.alwaysOn);
        }
    }
    /**
     * onRenamed is called when the user updates the device's name.
     * This method can be used this to synchronise the name to the device.
     * @param {string} name The new name
     */
    async onRenamed(name) {
        this.log("Device '" + this.id + "' was renamed to '" + name + "'");
    }
    /**
     * onDeleted is called when the user deleted the device.
     */
    async onDeleted() {
        if (this.timer)
            this.homey.clearInterval(this.timer);
        this.log("Device '" + this.id + "' has been deleted");
    }
}
exports.MyDevice = MyDevice;
module.exports = MyDevice;
