import { useEffect } from "react";
import { AppStateStore } from "../stores/appstate";
import { DeviceStateStore } from "../stores/devicestate";
import { platformEvents } from "./platformUtils";

/**
 * Experimental "keep amp awake": a Spark powers itself off after a while without use
 * (Auto Standby / Auto Shutdown). While the setting is on and an amp is connected, this
 * sends a harmless query every KEEP_AWAKE_INTERVAL_MS in the hope that the traffic resets
 * that timer. Whether it does has not been verified on hardware.
 *
 * The query is the serial number request (request_info 0x23): it only reads, and its reply
 * is not acted on by the app, so it changes nothing on the amp or in the UI. Nothing else in
 * the app sends it, so how a Spark 2 frames the reply has not been seen yet. Not
 * get_selected_channel, whose reply can switch the channel shown and re-read the preset.
 */
export const KEEP_AWAKE_INTERVAL_MS = 10 * 60 * 1000;

export interface KeepAwakeEvents {
    invoke(type: string, data: any): Promise<any>;
}

/**
 * Sends one keep-alive through the device context. Rejects unless the query was written to
 * the amp: the general command path swallows write errors, so it has its own action.
 */
export async function sendKeepAliveQuery(events: KeepAwakeEvents = platformEvents): Promise<void> {
    const written = await events.invoke("perform-action", { action: "keepAwakePing", data: {} });
    if (written !== true) {
        throw new Error("The query could not be written to the amp");
    }
}

export interface KeepAwakeOptions {
    /** Sends one keep-alive query; rejects when it could not be sent. */
    send: () => Promise<unknown>;
    setInterval?: (fn: () => void, ms: number) => any;
    clearInterval?: (handle: any) => void;
    now?: () => number;
    log?: (msg: string) => void;
}

export class KeepAwakeController {
    private readonly send: () => Promise<unknown>;
    private readonly setIntervalFn: (fn: () => void, ms: number) => any;
    private readonly clearIntervalFn: (handle: any) => void;
    private readonly now: () => number;
    private readonly log: (msg: string) => void;

    private timer: any = null;
    // The send in flight, if any. Dropped when the controller stops, so a send that never
    // settles on a dead connection doesn't block the next connection's.
    private pending: object | null = null;
    private unsubscribers: (() => void)[] = [];

    constructor(options: KeepAwakeOptions) {
        this.send = options.send;
        this.setIntervalFn = options.setInterval ?? ((fn, ms) => setInterval(fn, ms));
        this.clearIntervalFn = options.clearInterval ?? ((handle) => clearInterval(handle));
        this.now = options.now ?? (() => Date.now());
        this.log = options.log ?? ((msg) => console.log(msg));
    }

    get isRunning() {
        return this.timer != null;
    }

    /** Follows the setting and the connection state; safe to call more than once. */
    start() {
        if (this.unsubscribers.length > 0) return;
        this.unsubscribers = [
            AppStateStore.subscribe(s => s.keepAmpAwake == true, () => this.update()),
            DeviceStateStore.subscribe(s => s.isConnected == true, () => this.update()),
        ];
        this.update();
    }

    dispose() {
        this.unsubscribers.forEach(unsubscribe => unsubscribe());
        this.unsubscribers = [];
        this.stop();
    }

    private update() {
        const wanted = this.unsubscribers.length > 0
            && AppStateStore.getRawState().keepAmpAwake == true
            && DeviceStateStore.getRawState().isConnected == true;

        if (wanted && this.timer == null) {
            this.timer = this.setIntervalFn(() => void this.tick(), KEEP_AWAKE_INTERVAL_MS);
            void this.tick();
        } else if (!wanted) {
            this.stop();
        }
    }

    private stop() {
        if (this.timer != null) {
            this.clearIntervalFn(this.timer);
            this.timer = null;
        }
        this.pending = null;
    }

    private async tick() {
        if (this.pending) {
            this.log("Keep awake: previous query still pending, skipping");
            return;
        }
        const token = {};
        this.pending = token;
        try {
            await this.send();
            if (this.pending !== token) return;
            DeviceStateStore.update(s => { s.keepAwakeLastSent = this.now(); s.keepAwakeLastError = null; });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.log("Keep awake: query failed: " + message);
            if (this.pending !== token) return;
            DeviceStateStore.update(s => { s.keepAwakeLastError = message || "Query failed"; });
        } finally {
            if (this.pending === token) this.pending = null;
        }
    }
}

/** Runs the keep-awake queries for the lifetime of the calling component (the app). */
export function useAmpKeepAwake(send: () => Promise<unknown> = () => sendKeepAliveQuery()) {
    useEffect(() => {
        const controller = new KeepAwakeController({ send });
        controller.start();
        return () => controller.dispose();
    }, []);
}
