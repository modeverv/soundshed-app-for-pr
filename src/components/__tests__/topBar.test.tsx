// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../testing/componentTestSetup";
import TopBar, { formatKeepAwakeTime, KEEP_AWAKE_HELP } from "../device/desk/top-bar";

let onToggleKeepAwake: ReturnType<typeof vi.fn<() => void>>;

type KeepAwakeProps = Partial<Pick<React.ComponentProps<typeof TopBar>, "keepAwake" | "keepAwakeLastSent" | "keepAwakeError">>;

const barProps = (keepAwake: KeepAwakeProps = {}): React.ComponentProps<typeof TopBar> => ({
  deviceName: "Spark 2",
  connected: true,
  numSlots: 8,
  selectedChannel: 0,
  isLive: false,
  toneName: "Clean Machine",
  onSetChannel: vi.fn(),
  onRefresh: vi.fn(),
  saveOpen: false,
  saveDisabled: false,
  onToggleSave: vi.fn(),
  onFavourite: vi.fn(),
  onBrowseTones: vi.fn(),
  tunerOpen: false,
  onToggleTuner: vi.fn(),
  helpOpen: false,
  onToggleHelp: vi.fn(),
  notice: null,
  keepAwake: false,
  keepAwakeLastSent: null,
  keepAwakeError: null,
  onToggleKeepAwake,
  ...keepAwake,
});

const renderBar = (keepAwake: KeepAwakeProps = {}) => render(<TopBar {...barProps(keepAwake)} />);

const keepAwakeButton = () => screen.getByRole("button", { name: /keep awake/i });

beforeEach(() => {
  onToggleKeepAwake = vi.fn();
});

describe("top bar keep awake toggle", () => {
  it("shows whether it is on and explains that it is experimental", () => {
    renderBar();
    expect(keepAwakeButton()).toHaveAttribute("aria-pressed", "false");
    expect(keepAwakeButton()).toHaveAttribute("title", KEEP_AWAKE_HELP);
    expect(screen.queryByTestId("keep-awake-status")).toBeNull();

    renderBar({ keepAwake: true });
    expect(screen.getAllByRole("button", { name: /keep awake/i })[1]).toHaveAttribute("aria-pressed", "true");
  });

  it("calls the toggle handler", () => {
    renderBar();
    fireEvent.click(keepAwakeButton());
    expect(onToggleKeepAwake).toHaveBeenCalledTimes(1);
  });

  it("shows when the last query was sent while on", () => {
    const sent = new Date(2026, 0, 1, 12, 3).getTime();
    renderBar({ keepAwake: true, keepAwakeLastSent: sent });
    expect(screen.getByTestId("keep-awake-status")).toHaveTextContent(formatKeepAwakeTime(sent));
    expect(keepAwakeButton().getAttribute("title")).toContain(`Last query sent at ${formatKeepAwakeTime(sent)}`);
  });

  it("marks a failed query, with the error in the tooltip", () => {
    renderBar({ keepAwake: true, keepAwakeLastSent: Date.now(), keepAwakeError: "GATT operation failed" });
    expect(screen.getByTestId("keep-awake-status")).toHaveTextContent("!");
    expect(keepAwakeButton().getAttribute("title")).toContain("GATT operation failed");
  });

  it("keeps the button's name stable and gives the status as its description", () => {
    const sent = new Date(2026, 0, 1, 12, 3).getTime();
    const { rerender } = renderBar({ keepAwake: true, keepAwakeLastSent: sent });
    const button = screen.getByRole("button", { name: "Keep awake" });
    expect(button).toHaveAccessibleDescription(`Last query sent at ${formatKeepAwakeTime(sent)}.`);

    rerender(<TopBar {...barProps({ keepAwake: true, keepAwakeLastSent: sent, keepAwakeError: "GATT operation failed" })} />);
    expect(screen.getByRole("button", { name: "Keep awake" })).toHaveAccessibleDescription(
      "Last query failed: GATT operation failed"
    );
  });

  it("shows no status while off, even with an earlier send recorded", () => {
    renderBar({ keepAwake: false, keepAwakeLastSent: Date.now() });
    expect(screen.queryByTestId("keep-awake-status")).toBeNull();
  });
});
