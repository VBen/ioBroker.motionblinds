"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_motionblinds = require("motionblinds");
class Motionblinds extends utils.Adapter {
  gateway;
  devices = [];
  devicemap = /* @__PURE__ */ new Map();
  hbTimeout = 75;
  // default timing for heartbeat messages: 60s
  refreshInterval = 43200;
  // 12hours refresh for getting battery states from devices
  missedHeartbeats = 0;
  maxMissedHeartbeats = 4;
  //maximum middes hearbeats before assuming a lost connection
  heartbeatTimeout;
  queryDevicesInterval;
  constructor(options = {}) {
    super({
      ...options,
      name: "motionblinds"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    var _a;
    this.log.info("config token: " + this.config.token);
    if (this.config.timeout < 3 || !this.config.timeout) {
      this.config.timeout = 3;
      this.log.error("Timeout was lower than 3sec or undefined, value was resetted to 3sec, please correct your adapter configuration");
    }
    this.log.info("using timeout:" + this.config.timeout);
    this.setState("info.connection", { val: false, ack: true });
    this.setObjectNotExists("info.missingheartbeat", {
      type: "state",
      common: {
        name: "Missed Hearbeats",
        role: "counter",
        type: "number",
        read: false,
        write: true
      },
      native: {}
    }, () => {
      this.setState("info.missingheartbeat", this.missedHeartbeats, true);
    });
    this.gateway = new import_motionblinds.MotionGateway({ key: this.config.token, timeoutSec: this.config.timeout });
    this.gateway.start();
    this.gateway.on("report", (report) => {
      this.updateFromReport(report);
    });
    this.gateway.on("error", (err) => {
      this.log.error("Error: " + JSON.stringify(err));
    });
    this.gateway.on("heartbeat", (heartbeat) => {
      this.processHeartbeat(heartbeat);
    });
    await ((_a = this.gateway) == null ? void 0 : _a.readAllDevices().catch((reason) => {
      this.log.error("Failed fetching list of MOTION Blinds: " + JSON.stringify(reason));
    }).then((deviceData) => {
      this.processDeviceList(deviceData);
    }));
    this.subscribeStates("*.position");
    this.subscribeStates("*.fullup");
    this.subscribeStates("*.fulldown");
    this.subscribeStates("*.stop");
    this.subscribeStates("*.device_query");
    this.subscribeStates("*.angle");
    this.heartbeatTimeout = this.setTimeout(() => this.hbTimeoutExpired(), this.hbTimeout * 1e3);
    this.queryDevicesInterval = this.setInterval(() => {
      this.log.debug("auto refresh started");
      this.refreshDevices();
    }, this.refreshInterval * 1e3);
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
      this.clearTimeout(this.heartbeatTimeout);
      this.clearInterval(this.queryDevicesInterval);
      callback();
    } catch (e) {
      callback();
    }
  }
  async onStateChange(id, state) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (state) {
      if (state.ack == false) {
        this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
      }
      const devicetype = (_a = this.devicemap.get(this.getMacForID(id))) == null ? void 0 : _a.devtype;
      if (devicetype) {
        if (state.ack == false && id.search("position") > 0) {
          await ((_b = this.gateway) == null ? void 0 : _b.writeDevice(this.getMacForID(id), devicetype, { targetPosition: Number(state.val) }).then((value) => {
            this.updateFromReport(value);
          }).catch((err) => {
            this.log.error("got error while writing: " + JSON.stringify(err));
          }));
        } else if (state.ack == false && id.search("angle") > 0) {
          await ((_c = this.gateway) == null ? void 0 : _c.writeDevice(this.getMacForID(id), devicetype, { targetAngle: Number(state.val) }).then((value) => {
            this.updateFromReport(value);
          }).catch((err) => {
            this.log.error("got error while writing: " + JSON.stringify(err));
          }));
        } else if (state.ack == false && id.search("fullup") > 0) {
          this.setState(id, false, true);
          await ((_d = this.gateway) == null ? void 0 : _d.writeDevice(this.getMacForID(id), devicetype, { operation: 1 }).then((value) => {
            this.updateFromReport(value);
          }).catch((err) => {
            this.log.error("got error while writing: " + JSON.stringify(err));
          }));
        } else if (state.ack == false && id.search("fulldown") > 0) {
          this.setState(id, false, true);
          await ((_e = this.gateway) == null ? void 0 : _e.writeDevice(this.getMacForID(id), devicetype, { operation: 0 }).then((value) => {
            this.updateFromReport(value);
          }).catch((err) => {
            this.log.error("got error while writing: " + JSON.stringify(err));
          }));
        } else if (state.ack == false && id.search("stop") > 0) {
          this.setState(id, false, true);
          await ((_f = this.gateway) == null ? void 0 : _f.writeDevice(this.getMacForID(id), devicetype, { operation: 2 }).then((value) => {
            this.updateFromReport(value);
          }).catch((err) => {
            this.log.error("got error while writing: " + JSON.stringify(err));
          }));
        }
        if (state.ack == false) {
          this.setState(id, false, true);
          await ((_g = this.gateway) == null ? void 0 : _g.writeDevice(this.getMacForID(id), devicetype, { operation: 5 }).then((value) => {
            this.updateFromReport(value);
          }).catch((err) => {
            this.log.error("got error while writing: " + JSON.stringify(err));
          }));
        }
      }
      if (state.ack == false && id.search("refreshDevs") > 0) {
        this.setState(id, false, true);
        this.log.info("Device refresh was triggered");
        await ((_h = this.gateway) == null ? void 0 : _h.readAllDevices().catch((reason) => {
          this.log.error("Failed fetching list of MOTION Blinds: " + JSON.stringify(reason));
        }).then((deviceData) => {
          this.processDeviceList(deviceData);
        }));
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
    if (report.deviceType == import_motionblinds.DEVICE_TYPE_GATEWAY) {
      return;
    }
    this.log.debug("Parsing Message: " + JSON.stringify(report));
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
          unit = "\uFFFD";
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
          value = Math.round(import_motionblinds.MotionGateway.BatteryInfo(value)[1] * 100);
          break;
        default:
      }
      this.setObjectNotExists(
        dp,
        {
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
        },
        () => {
          this.setState(dp, value, true);
        }
      );
    });
    const btns = ["fullup", "fulldown", "stop", "device_query"];
    for (const btn of btns) {
      this.setObjectNotExists(
        report.mac + "." + btn,
        {
          type: "state",
          common: {
            name: btn,
            role: "button",
            type: "boolean",
            read: false,
            write: true
          },
          native: {}
        },
        () => {
          this.setState(report.mac + "." + btn, false, true);
        }
      );
    }
  }
  processHeartbeat(heartbeat) {
    this.log.debug("Heartbeat: " + JSON.stringify(heartbeat));
    this.log.debug("Resetting heartbeat timeout");
    this.clearTimeout(this.heartbeatTimeout);
    this.heartbeatTimeout = this.setTimeout(() => this.hbTimeoutExpired(), this.hbTimeout * 1e3);
    this.missedHeartbeats = 0;
    this.setObjectNotExists("info.missingheartbeat", {
      type: "state",
      common: {
        name: "Missed Hearbeats",
        role: "counter",
        type: "number",
        read: false,
        write: true
      },
      native: {}
    }, () => {
      this.setState("info.missingheartbeat", this.missedHeartbeats, true);
    });
    this.setState("info.connection", { val: true, ack: true });
    this.setObjectNotExists(heartbeat.mac, {
      type: "channel",
      common: {
        name: "Bridge " + heartbeat.mac,
        role: "blind"
      },
      native: {
        mac: heartbeat.mac
      }
    });
    this.setObjectNotExistsAsync(heartbeat.mac + ".devCount", {
      type: "state",
      common: {
        name: "Device Count",
        role: "blind",
        type: "number",
        read: true,
        write: false
      },
      native: {}
    }, () => {
      this.setState(heartbeat.mac + ".devCount", heartbeat.data.numberOfDevices, true);
    });
    this.setObjectNotExistsAsync(heartbeat.mac + ".RSSI", {
      type: "state",
      common: {
        name: "RSSI Count",
        role: "blind",
        type: "number",
        read: true,
        write: false
      },
      native: {}
    }, () => {
      this.setState(heartbeat.mac + ".RSSI", heartbeat.data.RSSI, true);
    });
    this.setObjectNotExists(heartbeat.mac + ".refreshDevs", {
      type: "state",
      common: {
        name: "Refresh Devices",
        role: "button",
        type: "boolean",
        read: false,
        write: true
      },
      native: {}
    }, () => {
      this.setState(heartbeat.mac + ".refreshDevs", false, true);
    });
    this.subscribeStates("*.refreshDevs");
  }
  processDeviceList(devList) {
    this.log.info("processing device list");
    this.devices = devList;
    if (this.devices) {
      this.setState("info.connection", { val: true, ack: true });
      this.log.debug("Devices: " + JSON.stringify(this.devices));
      for (const dev of this.devices) {
        this.devicemap.set(dev.mac, { devtype: dev.deviceType });
      }
    }
    this.refreshDevices();
  }
  refreshDevices() {
    var _a;
    this.log.debug("refreshing devices");
    for (const [mac, data] of this.devicemap) {
      (_a = this.gateway) == null ? void 0 : _a.readDevice(mac, data.devtype).then((value) => {
        const reportdata = { msgType: "Report", data: value.data, mac, deviceType: data.devtype };
        this.updateFromReport(reportdata);
      }).catch(
        (err) => {
          return err;
        }
      );
    }
  }
  hbTimeoutExpired() {
    this.log.debug("heartbeat timed out");
    this.clearTimeout(this.heartbeatTimeout);
    this.heartbeatTimeout = this.setTimeout(() => this.hbTimeoutExpired(), this.hbTimeout * 1e3);
    this.missedHeartbeats = this.missedHeartbeats + 1;
    this.setState("info.missingheartbeat", this.missedHeartbeats, true);
    if (this.missedHeartbeats == this.maxMissedHeartbeats) {
      this.log.info("Missing hearbeat for more than " + this.missedHeartbeats * this.hbTimeout + " seconds, assuming conection to bridge lost");
    }
    if (this.missedHeartbeats == 2) {
      this.log.info("heartbeat missing for more then " + this.hbTimeout * this.missedHeartbeats + " seconds, pleas check yor network connection");
    }
    if (this.missedHeartbeats >= this.maxMissedHeartbeats) {
      this.setState("info.connection", { val: false, ack: true });
    }
  }
}
if (require.main !== module) {
  module.exports = (options) => new Motionblinds(options);
} else {
  (() => new Motionblinds())();
}
//# sourceMappingURL=main.js.map
