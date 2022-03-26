var __create = Object.create;
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target, mod));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_motionblinds = require("motionblinds");
class Motionblinds extends utils.Adapter {
  constructor(options = {}) {
    super(__spreadProps(__spreadValues({}, options), {
      name: "motionblinds"
    }));
    this.devices = [];
    this.devicemap = /* @__PURE__ */ new Map();
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async onReady() {
    this.log.info("config token: " + this.config.token);
    if (this.config.timeout < 3 || !this.config.timeout) {
      this.config.timeout = 0;
      this.log.error("Timout was lower than 3sec or undefined, value was resetted to 3sec, please correct your adapter configuration");
    }
    this.log.info("using timeout:" + this.config.timeout);
    this.setState("info.connection", false, true);
    this.gateway = new import_motionblinds.MotionGateway({ key: this.config.token, timeoutSec: this.config.timeout });
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
    this.setState("info.connection", false, true);
    this.log.info("Fetching device list");
    this.devices = await this.gateway.readAllDevices().catch((reason) => this.log.error("Failed fetching list of MOTION Blinds: " + JSON.stringify(reason)));
    if (this.devices) {
      this.setState("info.connection", true, true);
      this.log.debug("Devices: " + JSON.stringify(this.devices));
      for (const dev of this.devices) {
        this.devicemap.set(dev.mac, { devtype: dev.deviceType });
      }
    }
    for (const [mac, data] of this.devicemap) {
      await this.gateway.readDevice(mac, data.devtype).then((value) => {
        const reportdata = { msgType: "Report", data: value.data, mac, deviceType: data.devtype };
        this.updateFromReport(reportdata);
      }).catch((err) => {
        return err;
      });
    }
    this.log.debug(JSON.stringify(this.devices));
    this.subscribeStates("*.position");
    this.subscribeStates("*.fullup");
    this.subscribeStates("*.fulldown");
    this.subscribeStates("*.stop");
    this.subscribeStates("*.device_query");
    this.subscribeStates("*.angle");
  }
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
      callback();
    } catch (e) {
      callback();
    }
  }
  async onStateChange(id, state) {
    var _a, _b, _c, _d, _e, _f, _g;
    if (state) {
      this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
      let doUpdate = false;
      const devicetype = (_a = this.devicemap.get(this.getMacForID(id))) == null ? void 0 : _a.devtype;
      if (devicetype) {
        if (state.ack == false && id.search("position") > 0) {
          await ((_b = this.gateway) == null ? void 0 : _b.writeDevice(this.getMacForID(id), devicetype, { targetPosition: Number(state.val) }).then((value) => {
            this.log.info("got ack: " + JSON.stringify(value));
          }).catch((err) => {
            this.log.error("got error while writing: " + JSON.stringify(err));
          }));
          doUpdate = true;
        } else if (state.ack == false && id.search("angle") > 0) {
          await ((_c = this.gateway) == null ? void 0 : _c.writeDevice(this.getMacForID(id), devicetype, { targetAngle: Number(state.val) }).then((value) => {
            this.log.info("got ack: " + JSON.stringify(value));
          }).catch((err) => {
            this.log.error("got error while writing: " + JSON.stringify(err));
          }));
          doUpdate = true;
        } else if (state.ack == false && id.search("fullup") > 0) {
          await ((_d = this.gateway) == null ? void 0 : _d.writeDevice(this.getMacForID(id), devicetype, { operation: 1 }).then((value) => {
            this.log.info("got ack: " + JSON.stringify(value));
          }).catch((err) => {
            this.log.error("got error while writing: " + JSON.stringify(err));
          }));
        } else if (state.ack == false && id.search("fulldown") > 0) {
          await ((_e = this.gateway) == null ? void 0 : _e.writeDevice(this.getMacForID(id), devicetype, { operation: 0 }).then((value) => {
            this.log.info("got ack: " + JSON.stringify(value));
          }).catch((err) => {
            this.log.error("got error while writing: " + JSON.stringify(err));
          }));
        } else if (state.ack == false && id.search("stop") > 0) {
          await ((_f = this.gateway) == null ? void 0 : _f.writeDevice(this.getMacForID(id), devicetype, { operation: 2 }).then((value) => {
            this.log.info("got ack: " + JSON.stringify(value));
          }).catch((err) => {
            this.log.error("got error while writing: " + JSON.stringify(err));
          }));
        }
        if (state.ack == false && doUpdate) {
          await ((_g = this.gateway) == null ? void 0 : _g.writeDevice(this.getMacForID(id), devicetype, { operation: 5 }).then((value) => {
            this.log.info("got ack: " + JSON.stringify(value));
          }).catch((err) => {
            this.log.error("got error while writing: " + JSON.stringify(err));
          }));
        }
      }
    } else {
      this.log.info(`state ${id} deleted`);
    }
  }
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
          value = import_motionblinds.BlindType[value].toString();
          break;
        case "operation":
          name = "Current operation";
          value = import_motionblinds.Operation[value].toString();
          break;
        case "currentAngle":
          dp = dp = report.mac + ".angle";
          name = "Shutter Angle";
          type = "number";
          unit = "\xB0";
          write = true;
          break;
        case "voltageMode":
          name = "Motor type";
          value = import_motionblinds.VoltageMode[value].toString();
          break;
        case "currentState":
          name = "Current state";
          value = import_motionblinds.LimitsState[value].toString();
          break;
        case "wirelessMode":
          name = "Wireless type";
          value = import_motionblinds.WirelessMode[value].toString();
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
          name,
          role: "blind",
          type,
          read: true,
          write,
          unit
        },
        native: {}
      }, () => {
        this.setState(dp, value, true);
      });
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
          write: true
        },
        native: {}
      });
    }
  }
}
if (require.main !== module) {
  module.exports = (options) => new Motionblinds(options);
} else {
  (() => new Motionblinds())();
}
//# sourceMappingURL=main.js.map
