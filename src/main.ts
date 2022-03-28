/*
 * Created with @iobroker/create-adapter v1.34.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from "@iobroker/adapter-core";
import { MotionGateway, Report, BlindType, ReadDeviceAck, DeviceType, Operation, VoltageMode, LimitsState, WirelessMode, Heartbeat, WriteDeviceAck, DEVICE_TYPE_GATEWAY } from "motionblinds";


// Load your modules here, e.g.:
// import * as fs from "fs";
type DeviceData = {
	devtype: DeviceType
}

class Motionblinds extends utils.Adapter {

	private gateway?: MotionGateway;
	private devices: void | ReadDeviceAck[] = [];
	private devicemap = new Map<string, DeviceData>();
	private hbTimeout = 75; // default timing for heartbeat messages: 60s
	private refreshInterval = 43200; // 12hours refresh for getting battery states from devices
	private missedHeartbeats = 0;
	private maxMissedHeartbeats = 4; //maximum middes hearbeats before assuming a lost connection
	private heartbeatTimeout!: ioBroker.Timeout;
	private queryDevicesInterval!: ioBroker.Interval ;




	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: "motionblinds",
		});

		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		this.on("unload", this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	private async onReady(): Promise<void> {
		// Initialize your adapter here
		this.log.info("config token: " + this.config.token);

		if(this.config.timeout<3 || !this.config.timeout){
			this.config.timeout = 3
			this.log.error("Timeout was lower than 3sec or undefined, value was resetted to 3sec, please correct your adapter configuration")
		}

		this.log.info("using timeout:" + this.config.timeout);

		// Reset the connection indicator during startup
		this.setState("info.connection",{val:false, ack:true});
		this.setObjectNotExists("info.missingheartbeat", {
			type: "state",
			common: {
				name: "Missed Hearbeats",
				role: "counter",
				type: "number",
				read: false,
				write: true,
			}, native: {}
		},() => {this.setState("info.missingheartbeat", this.missedHeartbeats, true)});
		this.gateway = new MotionGateway({ key: this.config.token, timeoutSec: this.config.timeout });
		this.gateway.start();

		this.gateway.on("report", (report) => {
			this.updateFromReport(report);
		})
		this.gateway.on("error", (err) => {
			this.log.error("Error: " + JSON.stringify(err));
		})
		this.gateway.on("heartbeat", (heartbeat) => {
			this.processHeartbeat(heartbeat);
		})

		await this.gateway?.readAllDevices()
			.catch((reason) => {this.log.error("Failed fetching list of MOTION Blinds: " + JSON.stringify(reason))})
			.then((deviceData) => {this.processDeviceList(deviceData);});

		this.subscribeStates("*.position");
		this.subscribeStates("*.fullup");
		this.subscribeStates("*.fulldown");
		this.subscribeStates("*.stop");
		this.subscribeStates("*.device_query");
		this.subscribeStates("*.angle");

		this.heartbeatTimeout = this.setTimeout(()=> this.hbTimeoutExpired(),this.hbTimeout*1000);
		this.queryDevicesInterval = this.setInterval(()=>{
			this.log.debug("auto refresh started")
			this.refreshDevices()
		},this.refreshInterval*1000);
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 */
	private onUnload(callback: () => void): void {
		this.log.info("Shutting down adapter");
		try {
			if (this.gateway) {
				if (this.gateway.sendSocket) this.gateway.sendSocket.close();
				if (this.gateway.recvSocket) this.gateway.recvSocket.close();
				this.gateway.stop();
			}
			// Here you must clear all timeouts or intervals that may still be active
			this.clearTimeout(this.heartbeatTimeout);
			// clearTimeout(timeout2);
			// ...cxyc
			this.clearInterval(this.queryDevicesInterval);

			callback();
		} catch (e) {
			callback();
		}
	}



	private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
		/**
		 * Is called if a subscribed state changes
	 	*/
		if (state) {
			// The state was changed
			if(state.ack == false){
				this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
			}
			const devicetype = this.devicemap.get(this.getMacForID(id))?.devtype;
			if (devicetype) {
				if (state.ack == false && id.search("position") > 0) {
					await this.gateway?.writeDevice(this.getMacForID(id), devicetype, { targetPosition: Number(state.val) })
						.then((value) => {this.updateFromReport(value)	})
						.catch((err) => { this.log.error("got error while writing: " + JSON.stringify(err)) });
				} else if (state.ack == false && id.search("angle") > 0) {
					await this.gateway?.writeDevice(this.getMacForID(id), devicetype, { targetAngle: Number(state.val) })
						.then((value) => {this.updateFromReport(value)})
						.catch((err) => { this.log.error("got error while writing: " + JSON.stringify(err)) });
				} else if (state.ack == false && id.search("fullup") > 0) {
					this.setStateAsync(id,false,true)
					await this.gateway?.writeDevice(this.getMacForID(id), devicetype, { operation: 1 })
						.then((value) => {this.updateFromReport(value)})
						.catch((err) => { this.log.error("got error while writing: " + JSON.stringify(err)) });
				} else if (state.ack == false && id.search("fulldown") > 0) {
					this.setStateAsync(id,false,true)
					await this.gateway?.writeDevice(this.getMacForID(id), devicetype, { operation: 0 })
						.then((value) => {this.updateFromReport(value)})
						.catch((err) => { this.log.error("got error while writing: " + JSON.stringify(err)) });
				} else if (state.ack == false && id.search("stop") > 0) {
					this.setStateAsync(id,false,true)
					await this.gateway?.writeDevice(this.getMacForID(id), devicetype, { operation: 2 })
						.then((value) => {this.updateFromReport(value) })
						.catch((err) => { this.log.error("got error while writing: " + JSON.stringify(err)) });
				}
				if (state.ack == false) {
					this.setStateAsync(id,false,true)
					await this.gateway?.writeDevice(this.getMacForID(id), devicetype, { operation: 5 })
						.then((value) => { this.updateFromReport(value)})
						.catch((err) => { this.log.error("got error while writing: " + JSON.stringify(err)) });
				}
			}
			if (state.ack == false && id.search("refreshDevs") > 0){
				this.setStateAsync(id,false,true)
				this.log.info("Device refresh was triggered")
				await this.gateway?.readAllDevices()
					.catch((reason) => {this.log.error("Failed fetching list of MOTION Blinds: " + JSON.stringify(reason))})
					.then((deviceData) => {this.processDeviceList(deviceData);});
			}
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	private getMacForID(id: string): string {
		/*extracts the mac from given id */
		const splitted_id: string[] = id.split(".");
		return splitted_id[splitted_id.length - 2];
	}

	private updateFromReport(report: Report | WriteDeviceAck): void {
		/* updates and creates devices from device Reports and  WriteDeviceAck Messegaes*/
		if(report.deviceType == DEVICE_TYPE_GATEWAY){
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
			let value: any = Object.values(data)[idx];

			let dp = report.mac + "." + key;
			let name: string = key;
			let unit = "";
			let type: any = "string";
			let write = false;

			switch (key) {
				case "type":
					name = "Blind type";
					value = BlindType[value].toString();
					break;
				case "operation":
					name = "Current operation";
					value = Operation[value].toString();
					break;
				case "currentAngle":
					dp = dp = report.mac + ".angle";
					name = "Shutter Angle";
					type = "number";
					unit = "°"
					write = true;
					break;
				case "voltageMode":
					name = "Motor type"
					value = VoltageMode[value].toString();
					break;
				case "currentState":
					name = "Current state";
					value = LimitsState[value].toString();
					break;
				case "wirelessMode":
					name = "Wireless type";
					value = WirelessMode[value].toString();
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
					type = "number"
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
			},() => {this.setState(dp, value, true);}
			);


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
			},() => {this.setState(report.mac + "." + btn, false, true)}
			);

		}

	}
	private processHeartbeat(heartbeat: Heartbeat): void {
		/* processes received hearbeat messages and set info.connction to true after receiving */
		this.log.debug("Heartbeat: " + JSON.stringify(heartbeat));
		this.log.debug("Resetting heartbeat timeout")
		clearTimeout(this.heartbeatTimeout)
		this.heartbeatTimeout = this.setTimeout(()=>this.hbTimeoutExpired(),this.hbTimeout*1000);
		this.missedHeartbeats = 0
		this.setObjectNotExists("info.missingheartbeat", {
			type: "state",
			common: {
				name: "Missed Hearbeats",
				role: "counter",
				type: "number",
				read: false,
				write: true,
			}, native: {}
		},() => {this.setState("info.missingheartbeat", this.missedHeartbeats, true)});
		this.setState("info.connection", {val:true, ack:true});
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

		this.setObjectNotExistsAsync(heartbeat.mac + ".devCount",{
			type: "state",
			common: {
				name: "Device Count",
				role: "blind",
				type: "number",
				read: true,
				write: false
			},
			native: {}
		},() => {this.setState(heartbeat.mac + ".devCount", heartbeat.data.numberOfDevices, true);});

		this.setObjectNotExistsAsync(heartbeat.mac + ".RSSI",{
			type: "state",
			common: {
				name: "RSSI Count",
				role: "blind",
				type: "number",
				read: true,
				write: false
			},
			native: {}
		},() => {this.setState(heartbeat.mac + ".RSSI", heartbeat.data.RSSI, true);});
		this.setObjectNotExists(heartbeat.mac + ".refreshDevs", {
			type: "state",
			common: {
				name: "Refresh Devices",
				role: "button",
				type: "boolean",
				read: false,
				write: true,
			}, native: {}
		},() => {this.setState(heartbeat.mac + ".refreshDevs", false, true)});
		this.subscribeStates("*.refreshDevs");
	}

	private processDeviceList(devList : void | ReadDeviceAck[]): void{
		/*processe device list from bridge and initiates refresh of all known devices */
		this.log.info("processing device list");
		this.devices = devList
		if (this.devices) {
			this.setState("info.connection", {val:true, ack:true});

			this.log.debug("Devices: " + JSON.stringify(this.devices));
			for (const dev of this.devices) {
				this.devicemap.set(dev.mac, { devtype: dev.deviceType });
			}

		}
		this.refreshDevices()
	}

	private refreshDevices(): void{
		/*refrehes all known devices */
		this.log.debug("refreshing devices")
		for (const [mac, data] of this.devicemap) {

			this.gateway?.readDevice(mac, data.devtype)
				.then((value) => {
					const reportdata = { msgType: "Report", data: value.data, mac: mac, deviceType: data.devtype } as Report;
					this.updateFromReport(reportdata);
				})
				.catch((err) => { return err }
				)
		}
	}

	private hbTimeoutExpired(): void {
		/* handles heartbeat timeouts and sets info.connection to false after to many missed heatbeats*/
		this.log.debug("heartbeat timed out")
		clearTimeout(this.heartbeatTimeout)
		this.heartbeatTimeout = this.setTimeout(()=>this.hbTimeoutExpired(),this.hbTimeout*1000);
		this.missedHeartbeats = this.missedHeartbeats + 1
		this.setState("info.missingheartbeat", this.missedHeartbeats, true);


		if(this.missedHeartbeats == this.maxMissedHeartbeats){
			this.log.info("Missing hearbeat for more than " +(this.missedHeartbeats * this.hbTimeout) +" seconds, assuming conection to bridge lost")
		}
		if (this.missedHeartbeats == 2){
			this.log.info("heartbeat missing for more then " + (this.hbTimeout * this.missedHeartbeats) + " seconds, pleas check yor network connection")
		}
		if (this.missedHeartbeats >= this.maxMissedHeartbeats){
			this.setState("info.connection", {val:false, ack:true});
		}



	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Motionblinds(options);
} else {
	// otherwise start the instance directly
	(() => new Motionblinds())();
}
