"use strict";
/*
 * Created with @iobroker/create-adapter v1.34.0
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = __importStar(require("@iobroker/adapter-core"));
const motionblinds_1 = require("motionblinds");
class Motionblinds extends utils.Adapter {
    constructor(options = {}) {
        super({
            ...options,
            name: "motionblinds",
        });
        this.devices = [];
        this.devicemap = new Map();
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        // this.on("objectChange", this.onObjectChange.bind(this));
        // this.on("message", this.onMessage.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here
        // The adapters config (in the instance object everything under the attribute "native") is accessible via
        // this.config:
        this.log.info("config token: " + this.config.token);
        // Reset the connection indicator during startup
        this.setState("info.connection", false, true);
        this.gateway = new motionblinds_1.MotionGateway({ key: this.config.token });
        this.gateway.start();
        this.gateway.on("report", (report) => {
            this.updateFromReport(report);
        });
        this.gateway.on("error", (err) => {
            this.log.error("Error: " + JSON.stringify(err));
        });
        this.gateway.on("heartbeat", (heartbeat) => {
            this.log.debug("Heartbeat: " + JSON.stringify(heartbeat));
        });
        // Reset the connection indicator during startup
        this.setState("info.connection", false, true);
        this.log.info("Fetching device list");
        this.devices = await this.gateway.readAllDevices()
            .catch((reason) => this.log.error("Failed fetching list of MOTION Blinds: " + JSON.stringify(reason)));
        if (this.devices) {
            this.setState("info.connection", true, true);
            this.log.info("Devices: " + JSON.stringify(this.devices));
            for (const dev of this.devices) {
                this.devicemap.set(dev.mac, { devtype: dev.deviceType });
            }
        }
        for (const [mac, data] of this.devicemap) {
            await this.gateway.readDevice(mac, data.devtype)
                .then((value) => {
                const reportdata = { msgType: "Report", data: value.data, mac: mac, deviceType: data.devtype };
                this.updateFromReport(reportdata);
            })
                .catch((err) => { return err; });
        }
        this.log.debug(JSON.stringify(this.devices));
        this.subscribeStates("*.position");
        this.subscribeStates("*.fullup");
        this.subscribeStates("*.fulldown");
        this.subscribeStates("*.stop");
        this.subscribeStates("*.device_query");
        this.subscribeStates("*.angle");
        /*
        For every state in the system there has to be alDeviceType
                type: "boolean",
                role: "indicator",
                read: true,
                write: true,
            },
            native: {},
        });*/
        /*const states = this.getStatesAsync("*.position");
        this.log.silly("states:" + JSON.stringify(states));*/
        // In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
        // this.subscribeStates("testVariable");
        // You can also add a subscription for multiple states. The following line watches all states starting with "lights."
        // this.subscribeStates("lights.*");
        // Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
        // this.subscribeStates("*");
        /*
            setState examples
            you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
        */
        // the variable testVariable is set to true as command (ack=false)
        /*await this.setStateAsync("testVariable", true);

        // same thing, but the vaimport  * as os from "os";p user admin group admin: " + result);*/
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        this.log.info("Shutting down adapter");
        try {
            if (this.gateway) {
                if (this.gateway.sendSocket)
                    this.gateway.sendSocket.close();
                if (this.gateway.recvSocket)
                    this.gateway.recvSocket.close();
                this.gateway.stop();
            }
            // Here you must clear all timeouts or intervals that may still be active
            // clearTimeout(timeout1);
            // clearTimeout(timeout2);
            // ...cxyc
            // clearInterval(interval1);
            callback();
        }
        catch (e) {
            callback();
        }
    }
    // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
    // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
    // /**
    //  * Is called if a subscribed object changes
    //  */
    // private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
    // 	if (obj) {
    // 		// The object was changed
    // 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
    // 	} else {
    // 		// The object was deleted
    // 		this.log.info(`object ${id} deleted`);
    // 	}
    // }
    /**
     * Is called if a subscribed state changes
     */
    async onStateChange(id, state) {
        var _a, _b, _c, _d, _e, _f, _g;
        if (state) {
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
            let doUpdate = false;
            const devicetype = (_a = this.devicemap.get(this.getMacForID(id))) === null || _a === void 0 ? void 0 : _a.devtype;
            if (devicetype) {
                if (state.ack == false && id.search("position") > 0) {
                    await ((_b = this.gateway) === null || _b === void 0 ? void 0 : _b.writeDevice(this.getMacForID(id), devicetype, { targetPosition: Number(state.val) }).then((value) => { this.log.info("got ack: " + JSON.stringify(value)); }).catch((err) => { this.log.error("got error while writing: " + JSON.stringify(err)); }));
                    doUpdate = true;
                }
                else if (state.ack == false && id.search("angle") > 0) {
                    await ((_c = this.gateway) === null || _c === void 0 ? void 0 : _c.writeDevice(this.getMacForID(id), devicetype, { targetAngle: Number(state.val) }).then((value) => { this.log.info("got ack: " + JSON.stringify(value)); }).catch((err) => { this.log.error("got error while writing: " + JSON.stringify(err)); }));
                    doUpdate = true;
                }
                else if (state.ack == false && id.search("fullup") > 0) {
                    await ((_d = this.gateway) === null || _d === void 0 ? void 0 : _d.writeDevice(this.getMacForID(id), devicetype, { operation: 1 }).then((value) => { this.log.info("got ack: " + JSON.stringify(value)); }).catch((err) => { this.log.error("got error while writing: " + JSON.stringify(err)); }));
                }
                else if (state.ack == false && id.search("fulldown") > 0) {
                    await ((_e = this.gateway) === null || _e === void 0 ? void 0 : _e.writeDevice(this.getMacForID(id), devicetype, { operation: 0 }).then((value) => { this.log.info("got ack: " + JSON.stringify(value)); }).catch((err) => { this.log.error("got error while writing: " + JSON.stringify(err)); }));
                }
                else if (state.ack == false && id.search("stop") > 0) {
                    await ((_f = this.gateway) === null || _f === void 0 ? void 0 : _f.writeDevice(this.getMacForID(id), devicetype, { operation: 2 }).then((value) => { this.log.info("got ack: " + JSON.stringify(value)); }).catch((err) => { this.log.error("got error while writing: " + JSON.stringify(err)); }));
                }
                if (state.ack == false && doUpdate) {
                    await ((_g = this.gateway) === null || _g === void 0 ? void 0 : _g.writeDevice(this.getMacForID(id), devicetype, { operation: 5 }).then((value) => { this.log.info("got ack: " + JSON.stringify(value)); }).catch((err) => { this.log.error("got error while writing: " + JSON.stringify(err)); }));
                }
            }
        }
        else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
    }
    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
    //  */
    // private onMessage(obj: ioBroker.Message): void {
    // 	if (typeof obj === "object" && obj.message) {
    // 		if (obj.command === "send") {
    // 			// e.g. send email or pushover or whatever
    // 			this.log.info("send command");
    // 			// Send response in callback if required
    // 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
    // 		}
    // 	}
    // }
    getMacForID(id) {
        const splitted_id = id.split(".");
        return splitted_id[splitted_id.length - 2];
    }
    updateFromReport(report) {
        this.log.debug("Report: " + JSON.stringify(report));
        this.setObjectNotExists(report.mac, {
            type: "channel",
            common: {
                name: report.mac,
                role: "blind"
            },
            native: {
                mac: report.mac,
                deviceType: report.deviceType
            }
        });
        const data = report.data;
        Object.keys(data).forEach((key, idx) => {
            let value = Object.values(data)[idx];
            let dp = report.mac + "." + key;
            let name = key;
            let unit = "";
            let type = "string";
            let write = false;
            switch (key) {
                case "type":
                    name = "Blind type";
                    value = motionblinds_1.BlindType[value].toString();
                    break;
                case "operation":
                    name = "Current operation";
                    value = motionblinds_1.Operation[value].toString();
                    break;
                case "currentAngle":
                    dp = dp = report.mac + ".angle";
                    name = "Shutter Angle";
                    type = "number";
                    unit = "°";
                    write = true;
                    break;
                case "voltageMode":
                    name = "Motor type";
                    value = motionblinds_1.VoltageMode[value].toString();
                    break;
                case "currentState":
                    name = "Current state";
                    value = motionblinds_1.LimitsState[value].toString();
                    break;
                case "wirelessMode":
                    name = "Wireless type";
                    value = motionblinds_1.WirelessMode[value].toString();
                    break;
                case "RSSI":
                    type = "number";
                    break;
                case "currentPosition":
                    dp = dp = report.mac + ".position";
                    name = "Position";
                    type = "number";
                    write = true;
                    unit = "%";
                    break;
                case "batteryLevel":
                    name = "Battery Level";
                    unit = "%";
                    type = "number";
                    value = value / 10;
                    break;
                default:
            }
            this.setObjectNotExists(dp, {
                type: "state",
                common: {
                    name: name,
                    role: "blind",
                    type: type,
                    read: true,
                    write: write,
                    unit: unit
                },
                native: {}
            });
            this.setState(dp, value, true);
        });
        const btns = ["fullup", "fulldown", "stop", "device_query"];
        for (const btn of btns) {
            this.setObjectNotExists(report.mac + "." + btn, {
                type: "state",
                common: {
                    name: btn,
                    role: "button",
                    type: "boolean",
                    read: false,
                    write: true,
                }, native: {}
            });
        }
    }
}
if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options) => new Motionblinds(options);
}
else {
    // otherwise start the instance directly
    (() => new Motionblinds())();
}
//# sourceMappingURL=main.js.map