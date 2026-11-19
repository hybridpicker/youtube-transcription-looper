// Styles for the YouTube panel. They live in a shadow root so the page's CSS
// and the panel cannot affect each other.
globalThis.TL_PANEL_CSS = `
:host {
  all: initial;
  display: block;
  margin: 12px 0 16px;
  color-scheme: dark;
  --bg: #0f1215; --panel: #171c21; --panel-2: #1e252c; --line: #2a333c; --text: #e8edf2;
  --muted: #8b98a5; --accent: #f4b740; --accent-ink: #1b1403; --play: #ff5d5d;
  font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--text);
}
:host(.dock) { position: fixed; left: 0; right: 0; bottom: 0; margin: 0; z-index: 2147483000; max-height: 70vh; overflow: auto; box-shadow: 0 -8px 30px rgba(0,0,0,.5); }
:host([hidden]) { display: none; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.p { background: var(--bg); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 10px; }
:host(.dock) .p { border-radius: 12px 12px 0 0; }
.p.collapsed .more { display: none; }
.p.empty > :not(.head) { display: none; }
.p.empty .head .btn:not(#close):not(#files) { display: none; }
h2 { cursor: pointer; user-select: none; white-space: nowrap; margin: 0; font-size: 11px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.muted { color: var(--muted); }
.small { font-size: 11.5px; }
kbd { display: inline-block; min-width: 1.6em; padding: 0 5px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 5px; background: var(--panel-2); font: 600 11px/1.5 ui-monospace, Menlo, monospace; text-align: center; }
output { font-variant-numeric: tabular-nums; font-weight: 600; }

.head { display: flex; align-items: center; gap: 8px; }
.head b { font-size: 13px; white-space: nowrap; }
.logo { width: 15px; height: 15px; border-radius: 50%; border: 3px solid var(--accent); border-right-color: transparent; transform: rotate(35deg); flex: none; }
.hint { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 12px; }
.hint.warn { color: var(--accent); }

.btn { height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 7px; background: var(--panel-2); color: var(--text); font: 600 12px system-ui, sans-serif; cursor: pointer; white-space: nowrap; }
.btn:hover { background: #28323b; border-color: #3a4651; }
.btn:disabled { opacity: .4; cursor: default; }
.btn.ghost { background: transparent; color: var(--muted); }
.btn.ghost:hover { color: var(--text); }
.btn.icon { width: 30px; padding: 0; }
.btn .ic { display: none; }
output.reset { cursor: pointer; }
output.reset:hover { color: var(--accent); }
.btn.on { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

.wave { position: relative; height: 96px; border: 1px solid var(--line); border-radius: 9px; background: var(--panel); overflow: hidden; touch-action: pan-y; cursor: crosshair; }
.wave canvas { width: 100%; height: 100%; display: block; }
.playhead { position: absolute; top: 0; bottom: 0; left: 0; width: 2px; margin-left: -1px; background: var(--play); pointer-events: none; }
.playhead::before { content: ""; position: absolute; top: 0; left: -4px; border: 5px solid transparent; border-top: 7px solid var(--play); }

.transport { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.play { width: 38px; height: 38px; flex: none; border: 0; border-radius: 50%; background: var(--accent); cursor: pointer; position: relative; }
.play::before { content: ""; position: absolute; left: 15px; top: 11px; border: 8px solid transparent; border-left: 12px solid var(--accent-ink); border-right-width: 0; }
.play.on::before { left: 12px; top: 11px; width: 4px; height: 16px; border: 0; border-left: 5px solid var(--accent-ink); border-right: 5px solid var(--accent-ink); }
.clock { font: 600 18px/1 ui-monospace, Menlo, monospace; font-variant-numeric: tabular-nums; min-width: 150px; }
.clock .muted { font-size: 12px; font-weight: 500; }
.group { display: flex; align-items: center; gap: 5px; padding: 5px; border: 1px solid var(--line); border-radius: 9px; background: var(--panel); flex-wrap: wrap; }
.group.right { margin-left: auto; }
.sep { width: 1px; height: 18px; background: var(--line); margin: 0 2px; }
.time-input { width: 78px; height: 28px; padding: 0 6px; border: 1px solid var(--line); border-radius: 7px; background: var(--bg); color: var(--text); font: 600 12px ui-monospace, Menlo, monospace; text-align: center; }
.time-input.bad { border-color: var(--play); }

.panels { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
.panel { padding: 10px 12px; border: 1px solid var(--line); border-radius: 9px; background: var(--panel); display: flex; flex-direction: column; gap: 7px; min-width: 0; }
h2::before { content: "▾"; display: inline-block; width: 1.1em; }
.panel.folded h2::before { content: "▸"; }
.panel.folded > :not(.panel-head) { display: none; }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 24px; }
.panel-head output { font-size: 16px; }
.field { display: grid; grid-template-columns: 46px minmax(0, 1fr) 54px; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; }
.field output { color: var(--text); text-align: right; font-size: 12px; white-space: nowrap; }
.field.band { grid-template-columns: 46px minmax(0, 1fr) auto; }
.field.band output { min-width: 54px; }
.chips { display: flex; gap: 4px; flex-wrap: wrap; }
.chips button { flex: 1 1 0; min-width: 26px; padding: 0; height: 24px; border: 1px solid var(--line); border-radius: 6px; background: transparent; color: var(--muted); font: 600 11.5px system-ui, sans-serif; cursor: pointer; }
.chips button:hover { color: var(--text); border-color: #3a4651; }
.chips button.on { color: var(--accent-ink); background: var(--accent); border-color: var(--accent); }
.stepper { display: flex; gap: 4px; }
.stepper .btn { flex: 1; padding: 0 4px; }
.dual { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
select { height: 26px; padding: 0 6px; border: 1px solid var(--line); border-radius: 7px; background: var(--panel-2); color: var(--text); font: 12px system-ui, sans-serif; }
input[type="range"] { width: 100%; margin: 0; accent-color: var(--accent); }

.bottom { display: grid; grid-template-columns: minmax(0, 3fr) minmax(220px, 2fr); gap: 10px; }
.spec canvas { width: 100%; height: 130px; display: block; border-radius: 6px; cursor: pointer; touch-action: none; }
.chord { font: 700 16px ui-monospace, Menlo, monospace; color: var(--accent); }
.head-right { display: flex; align-items: center; gap: 8px; }
.items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; max-height: 150px; overflow: auto; }
.items li { display: grid; grid-template-columns: 18px auto 1fr 22px; align-items: center; gap: 6px; padding: 2px 4px; border-radius: 6px; cursor: pointer; }
.items li:hover { background: var(--panel-2); }
.items .num { color: var(--muted); font: 600 11px ui-monospace, Menlo, monospace; text-align: center; }
.items .when { font: 600 11.5px ui-monospace, Menlo, monospace; white-space: nowrap; }
.items .when.loop { color: var(--accent); }
.items input { width: 100%; height: 24px; padding: 0 6px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--text); font: 12px system-ui, sans-serif; }
.items input:hover, .items input:focus { border-color: var(--line); background: var(--bg); }
.items .del { width: 22px; height: 22px; border: 0; border-radius: 6px; background: none; color: var(--muted); cursor: pointer; font-size: 14px; }
.items .del:hover { color: var(--play); }

.help { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 4px 16px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 9px; background: var(--panel); }
.help div { display: grid; grid-template-columns: 78px 1fr; gap: 8px; align-items: center; font-size: 12px; }
.help p { grid-column: 1 / -1; margin: 4px 0 0; }
@media (max-width: 700px) { .bottom { grid-template-columns: 1fr; } }

/* Sidebar placement: narrow, sticky next to the player, scrolls on its own. */
:host(.side) { position: sticky; top: 64px; z-index: 5; margin: 0 0 12px; max-height: calc(100vh - 76px); overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; border-radius: 12px; }
:host(.side) .p { padding: 8px; gap: 7px; }
:host(.side) .head { gap: 4px; }
:host(.side) .head b { display: none; }
:host(.side) .head .hint { order: 10; flex-basis: 100%; white-space: normal; }
:host(.side) .head .hint:empty { display: none; }
:host(.side) .head { flex-wrap: wrap; }
:host(.side) .head .logo { margin-right: auto; }
:host(.side) .btn { height: 26px; padding: 0 8px; }
:host(.side) .btn.icon { width: 28px; padding: 0; }
:host(.side) .wave { height: 74px; }
:host(.side) .transport { gap: 6px; }
:host(.side) .play { width: 34px; height: 34px; }
:host(.side) .play::before { left: 13px; top: 9px; }
:host(.side) .play.on::before { left: 10px; top: 9px; }
:host(.side) .clock { font-size: 15px; min-width: 0; flex: 1; white-space: nowrap; }
:host(.side) .clock .muted { font-size: 11px; }
:host(.side) .group { padding: 4px; gap: 4px; }
:host(.side) .group:not(.right) { flex-basis: 100%; order: 5; }
:host(.side) .group .sep { display: none; }
:host(.side) .time-input { flex: 1; width: 0; min-width: 58px; height: 26px; }
:host(.side) .panels, :host(.side) .bottom { grid-template-columns: 1fr; gap: 7px; }
:host(.side) .panel { padding: 7px 9px; gap: 6px; }
:host(.side) .panel-head { min-height: 22px; }
:host(.side) .panel-head output { font-size: 14px; }
:host(.side) .spec canvas { height: 82px; }
:host(.side) [data-sec="places"] { order: -1; }
:host(.side) .btn .tx { display: none; }
:host(.side) .btn .ic { display: inline; }
:host(.side) #loop-save, :host(.side) #loop-clear { width: 28px; padding: 0; }
:host(.side) .items { max-height: 132px; }
:host(.side) .help { grid-template-columns: 1fr; }
`;
