import React from "react";

// One-row header of the amp screen: device, channel selector, tone name and the
// tone/amp actions. Popovers (save picker, shortcut help) are passed in and drop
// down under their buttons.

export interface DeskNotice {
  text: string;
  kind: "ok" | "error";
}

export const KEEP_AWAKE_HELP =
  "Experimental: while on, Soundshed queries the amp every 10 minutes to try to stop it powering off. " +
  "Whether this prevents auto standby has not been verified on hardware.";

export const formatKeepAwakeTime = (time: number) =>
  new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

interface TopBarProps {
  deviceName: string | null;
  connected: boolean;
  numSlots: number;
  selectedChannel: number;
  isLive: boolean;
  toneName: string | null;
  onSetChannel: (channel: number) => void;
  onRefresh: () => void;
  saveOpen: boolean;
  /** Not connected, or a save is already running */
  saveDisabled: boolean;
  onToggleSave: () => void;
  /** The popover triggers, so the screen can hand focus back when a popover closes */
  saveButtonRef?: React.Ref<HTMLButtonElement>;
  helpButtonRef?: React.Ref<HTMLButtonElement>;
  savePopover?: React.ReactNode;
  onFavourite: () => void;
  onBrowseTones: () => void;
  tunerOpen: boolean;
  onToggleTuner: () => void;
  helpOpen: boolean;
  onToggleHelp: () => void;
  helpPopover?: React.ReactNode;
  notice: DeskNotice | null;
  /** Experimental keep-awake queries (see core/keepAwake.ts) */
  keepAwake: boolean;
  keepAwakeLastSent: number | null;
  keepAwakeError: string | null;
  onToggleKeepAwake: () => void;
}

const TopBar = (props: TopBarProps) => {
  const {
    deviceName,
    connected,
    numSlots,
    selectedChannel,
    isLive,
    toneName,
    notice,
    keepAwake,
    keepAwakeLastSent,
    keepAwakeError,
  } = props;

  // While on: the time of the last query the amp accepted, or a marker when the last one failed.
  const keepAwakeStatus = !keepAwake
    ? null
    : keepAwakeError
      ? { text: "!", detail: `Last query failed: ${keepAwakeError}`, error: true }
      : keepAwakeLastSent != null
        ? { text: formatKeepAwakeTime(keepAwakeLastSent), detail: `Last query sent at ${formatKeepAwakeTime(keepAwakeLastSent)}.`, error: false }
        : null;

  return (
    <header className="amp-desk-topbar">
      <div className="amp-desk-topbar__device" title={connected ? "Connected" : "Not connected"}>
        <span className={`status-dot ${connected ? "connected" : "disconnected"}`} aria-hidden="true" />
        <span className="amp-desk-topbar__device-name">{deviceName || "Spark"}</span>
      </div>

      <div className="amp-desk-topbar__channels">
        <span id="amp-desk-channel-label" className="amp-desk-topbar__label">
          Channel
        </span>
        <div className="amp-desk-channels" role="group" aria-labelledby="amp-desk-channel-label">
          {Array.from({ length: numSlots }, (_, i) => (
            <button
              key={i}
              type="button"
              className={`amp-desk-channel ${selectedChannel === i ? "is-active" : ""}`}
              id={`ch${i + 1}`}
              aria-label={`Channel ${i + 1}`}
              aria-pressed={selectedChannel === i}
              onClick={() => props.onSetChannel(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
        {isLive && (
          <span className="amp-desk-live" title="A tone applied from the library, not stored on a channel yet">
            Live
          </span>
        )}
      </div>

      <div className="amp-desk-topbar__tone" title={toneName ?? ""}>
        <span className="amp-desk-topbar__tone-name" data-testid="tone-name">
          {toneName || "No tone loaded"}
        </span>
        {notice && (
          <span
            className={`amp-desk-notice amp-desk-notice--${notice.kind}`}
            role={notice.kind == "error" ? "alert" : "status"}
          >
            {notice.text}
          </span>
        )}
      </div>

      <div className="amp-desk-topbar__actions">
        <button type="button" className="amp-desk-action" onClick={props.onRefresh} title="Refresh current preset from amp" aria-label="Refresh">
          ↺
        </button>
        <div className="amp-desk-anchor">
          <button
            ref={props.saveButtonRef}
            type="button"
            id="storePreset"
            className={`amp-desk-action ${props.saveOpen ? "is-active" : ""}`}
            aria-expanded={props.saveOpen}
            aria-haspopup="dialog"
            disabled={props.saveDisabled}
            title={
              connected
                ? "Save the current tone to a channel on the amp (Ctrl/⌘+S)"
                : "Connect an amp to save the tone to it"
            }
            onClick={props.onToggleSave}
          >
            ↓ Save to Amp
          </button>
          {props.saveOpen && props.savePopover}
        </div>
        <button type="button" className="amp-desk-action" title="Save as Favourite" onClick={props.onFavourite}>
          ★ Favourite
        </button>
        <button type="button" className="amp-desk-action" onClick={props.onBrowseTones}>
          Browse Tones
        </button>
        <button
          type="button"
          className={`amp-desk-action ${props.tunerOpen ? "is-active" : ""}`}
          aria-expanded={props.tunerOpen}
          aria-controls="amp-desk-tuner"
          onClick={props.onToggleTuner}
          title="Show the tuner"
        >
          Tuner
        </button>
        {/* The status is hidden from the button's name, which stays "Keep awake"; screen
            readers get it as the description instead. Narrow windows show only the dot. */}
        <button
          type="button"
          className={`amp-desk-action ${keepAwake ? "is-active" : ""}`}
          aria-pressed={keepAwake}
          aria-describedby={keepAwakeStatus ? "amp-desk-keepawake-status" : undefined}
          title={keepAwakeStatus ? `${KEEP_AWAKE_HELP}\n${keepAwakeStatus.detail}` : KEEP_AWAKE_HELP}
          onClick={props.onToggleKeepAwake}
        >
          Keep awake
          {keepAwakeStatus && (
            <span
              className={`amp-desk-keepawake ${keepAwakeStatus.error ? "amp-desk-keepawake--error" : ""}`}
              data-testid="keep-awake-status"
              aria-hidden="true"
            >
              {" • "}
              <span className="amp-desk-keepawake__text">{keepAwakeStatus.text}</span>
            </span>
          )}
        </button>
        {keepAwakeStatus && (
          <span id="amp-desk-keepawake-status" className="sr-only">
            {keepAwakeStatus.detail}
          </span>
        )}
        <div className="amp-desk-anchor">
          <button
            ref={props.helpButtonRef}
            type="button"
            className={`amp-desk-action amp-desk-action--icon ${props.helpOpen ? "is-active" : ""}`}
            aria-expanded={props.helpOpen}
            aria-haspopup="dialog"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            onClick={props.onToggleHelp}
          >
            ?
          </button>
          {props.helpOpen && props.helpPopover}
        </div>
      </div>
    </header>
  );
};

export default TopBar;
