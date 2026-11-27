import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KEEP_AWAKE_INTERVAL_MS, KeepAwakeController, sendKeepAliveQuery } from "../keepAwake";
import { DeviceContext } from "../deviceContext";
import { AppStateStore } from "../../stores/appstate";
import { DeviceStateStore } from "../../stores/devicestate";
import { SparkCommandMessage } from "../../spork/src/devices/spark/sparkCommandMessage";
import { SerialCommsProvider } from "../../spork/src/interfaces/serialCommsProvider";

const setEnabled = (on: boolean) => AppStateStore.update((s) => { s.keepAmpAwake = on; });
const setConnected = (on: boolean) => DeviceStateStore.update((s) => { s.isConnected = on; });
const flush = () => vi.advanceTimersByTimeAsync(0);

let send: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
let controller: KeepAwakeController;

const startController = () => {
    controller = new KeepAwakeController({ send, log: () => { } });
    controller.start();
};

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
    send = vi.fn().mockResolvedValue(true);
    setEnabled(false);
    setConnected(false);
    DeviceStateStore.update((s) => { s.keepAwakeLastSent = null; s.keepAwakeLastError = null; });
});

afterEach(() => {
    controller?.dispose();
    vi.useRealTimers();
});

describe("keeping the amp awake", () => {
    it("sends a query straight away when enabled and connected, then every 10 minutes", async () => {
        setEnabled(true);
        setConnected(true);
        startController();
        await flush();
        expect(send).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(KEEP_AWAKE_INTERVAL_MS - 1);
        expect(send).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(send).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(KEEP_AWAKE_INTERVAL_MS);
        expect(send).toHaveBeenCalledTimes(3);
    });

    it("sends nothing while disabled or disconnected", async () => {
        setConnected(true);
        startController();
        await vi.advanceTimersByTimeAsync(KEEP_AWAKE_INTERVAL_MS * 3);
        expect(send).not.toHaveBeenCalled();

        setConnected(false);
        setEnabled(true);
        await vi.advanceTimersByTimeAsync(KEEP_AWAKE_INTERVAL_MS * 3);
        expect(send).not.toHaveBeenCalled();
        expect(controller.isRunning).toBe(false);
    });

    it("starts when the setting is switched on, and stops when it is switched off", async () => {
        setConnected(true);
        startController();
        setEnabled(true);
        await flush();
        expect(send).toHaveBeenCalledTimes(1);

        setEnabled(false);
        await vi.advanceTimersByTimeAsync(KEEP_AWAKE_INTERVAL_MS * 3);
        expect(send).toHaveBeenCalledTimes(1);
        expect(controller.isRunning).toBe(false);
    });

    it("stops on disconnect and starts again, straight away, on reconnect", async () => {
        setEnabled(true);
        setConnected(true);
        startController();
        await flush();
        expect(send).toHaveBeenCalledTimes(1);

        setConnected(false);
        await vi.advanceTimersByTimeAsync(KEEP_AWAKE_INTERVAL_MS * 2);
        expect(send).toHaveBeenCalledTimes(1);

        setConnected(true);
        await flush();
        expect(send).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(KEEP_AWAKE_INTERVAL_MS);
        expect(send).toHaveBeenCalledTimes(3);
    });

    it("skips a tick while the previous query is still pending", async () => {
        let resolve: () => void = () => { };
        send.mockImplementation(() => new Promise<void>((r) => { resolve = r; }));
        setEnabled(true);
        setConnected(true);
        startController();
        await flush();
        expect(send).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(KEEP_AWAKE_INTERVAL_MS * 2);
        expect(send).toHaveBeenCalledTimes(1);

        resolve();
        await flush();
        await vi.advanceTimersByTimeAsync(KEEP_AWAKE_INTERVAL_MS);
        expect(send).toHaveBeenCalledTimes(2);
    });

    it("doesn't let a query stuck on a dropped connection block the next connection", async () => {
        send.mockImplementationOnce(() => new Promise(() => { }));
        setEnabled(true);
        setConnected(true);
        startController();
        await flush();

        setConnected(false);
        setConnected(true);
        await flush();
        expect(send).toHaveBeenCalledTimes(2);
    });

    it("records when the last query was sent, and a failure without throwing", async () => {
        setEnabled(true);
        setConnected(true);
        startController();
        await flush();
        expect(DeviceStateStore.getRawState().keepAwakeLastSent).toBe(new Date(2026, 0, 1, 12, 0, 0).getTime());
        expect(DeviceStateStore.getRawState().keepAwakeLastError).toBeNull();

        send.mockRejectedValueOnce(new Error("GATT operation failed"));
        await vi.advanceTimersByTimeAsync(KEEP_AWAKE_INTERVAL_MS);
        expect(DeviceStateStore.getRawState().keepAwakeLastError).toBe("GATT operation failed");
        // the last successful send is kept
        expect(DeviceStateStore.getRawState().keepAwakeLastSent).toBe(new Date(2026, 0, 1, 12, 0, 0).getTime());

        await vi.advanceTimersByTimeAsync(KEEP_AWAKE_INTERVAL_MS);
        expect(DeviceStateStore.getRawState().keepAwakeLastError).toBeNull();
        expect(DeviceStateStore.getRawState().keepAwakeLastSent).toBe(new Date(2026, 0, 1, 12, 20, 0).getTime());
    });

    it("stops its timer and stops following the stores once disposed", async () => {
        setEnabled(true);
        setConnected(true);
        startController();
        await flush();
        controller.dispose();
        expect(controller.isRunning).toBe(false);

        await vi.advanceTimersByTimeAsync(KEEP_AWAKE_INTERVAL_MS * 2);
        setConnected(false);
        setConnected(true);
        await flush();
        expect(send).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("starting twice doesn't double the queries", async () => {
        setEnabled(true);
        setConnected(true);
        startController();
        controller.start();
        await flush();
        await vi.advanceTimersByTimeAsync(KEEP_AWAKE_INTERVAL_MS);
        expect(send).toHaveBeenCalledTimes(2);
    });
});

class FakeProvider implements SerialCommsProvider {
    written: Uint8Array[] = [];
    failWrites = false;
    onDisconnected: (() => void) | null = null;
    async disconnect(): Promise<void> { }
    async connect(): Promise<boolean> {
        return true;
    }
    async scanForDevices(): Promise<any> {
        return [];
    }
    async beginQueuedReceive(): Promise<boolean> {
        return true;
    }
    readReceiveQueue(): Array<Uint8Array> {
        return null;
    }
    peekReceiveQueueEnd(): Uint8Array {
        return null;
    }
    async write(buffer): Promise<void> {
        if (this.failWrites) throw new Error("GATT write failed");
        this.written.push(new Uint8Array(buffer));
    }
    isSpark2Connection(): boolean {
        return false;
    }
}

describe("the keep-alive query through the device context", () => {
    let provider: FakeProvider;

    const startWithContext = () => {
        provider = new FakeProvider();
        const context = new DeviceContext();
        context.init(provider, () => { });
        const events = { invoke: (_type: string, data: any) => context.performAction(data) };
        controller = new KeepAwakeController({ send: () => sendKeepAliveQuery(events), log: () => { } });
        controller.start();
    };

    it("writes the serial number query and records the time", async () => {
        setEnabled(true);
        setConnected(true);
        startWithContext();
        await flush();

        expect(provider.written.map((w) => Array.from(w))).toEqual(
            new SparkCommandMessage().request_info(0x23).map((b) => Array.from(b))
        );
        expect(DeviceStateStore.getRawState().keepAwakeLastSent).toBe(new Date(2026, 0, 1, 12, 0, 0).getTime());
        expect(DeviceStateStore.getRawState().keepAwakeLastError).toBeNull();
    });

    it("records an error, not a send time, when the write to the amp fails", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => { });
        setEnabled(true);
        setConnected(true);
        startWithContext();
        await flush();
        const sentAt = DeviceStateStore.getRawState().keepAwakeLastSent;

        provider.failWrites = true;
        await vi.advanceTimersByTimeAsync(KEEP_AWAKE_INTERVAL_MS);

        expect(DeviceStateStore.getRawState().keepAwakeLastError).toBe("The query could not be written to the amp");
        expect(DeviceStateStore.getRawState().keepAwakeLastSent).toBe(sentAt);
        warn.mockRestore();
    });

    it("sendKeepAliveQuery rejects unless the action reports the write succeeded", async () => {
        await expect(sendKeepAliveQuery({ invoke: async () => false })).rejects.toThrow(/could not be written/);
        await expect(sendKeepAliveQuery({ invoke: async () => undefined })).rejects.toThrow(/could not be written/);
        await expect(sendKeepAliveQuery({ invoke: async () => true })).resolves.toBeUndefined();
    });
});
