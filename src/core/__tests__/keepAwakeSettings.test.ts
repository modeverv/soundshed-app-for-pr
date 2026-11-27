// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { AppViewModel } from "../appViewModel";
import { AppStateStore } from "../../stores/appstate";

describe("keep amp awake setting", () => {
  beforeEach(() => {
    localStorage.clear();
    AppStateStore.update((s) => { s.keepAmpAwake = true; });
  });

  it("is off with fresh settings", () => {
    new AppViewModel().loadSettings();
    expect(AppStateStore.getRawState().keepAmpAwake).toBe(false);
  });

  it("is off for settings saved before it existed", () => {
    localStorage.setItem("settings", JSON.stringify({ selectedMidiInput: "Pedal", numPresetSlots: 8 }));
    new AppViewModel().loadSettings();
    expect(AppStateStore.getRawState().keepAmpAwake).toBe(false);
    expect(AppStateStore.getRawState().selectedMidiInput).toBe("Pedal");
  });

  it("round-trips through save and load", () => {
    const vm = new AppViewModel();
    vm.loadSettings();
    vm.setKeepAmpAwake(true);
    expect(JSON.parse(localStorage.getItem("settings")).keepAmpAwake).toBe(true);

    AppStateStore.update((s) => { s.keepAmpAwake = false; });
    new AppViewModel().loadSettings();
    expect(AppStateStore.getRawState().keepAmpAwake).toBe(true);

    vm.setKeepAmpAwake(false);
    AppStateStore.update((s) => { s.keepAmpAwake = true; });
    new AppViewModel().loadSettings();
    expect(AppStateStore.getRawState().keepAmpAwake).toBe(false);
  });

  it("only treats a stored true as on", () => {
    localStorage.setItem("settings", JSON.stringify({ keepAmpAwake: "yes" }));
    new AppViewModel().loadSettings();
    expect(AppStateStore.getRawState().keepAmpAwake).toBe(false);
  });
});
