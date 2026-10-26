"use strict";

// PafoEdit (web): 1行20半角列の制限表示つきプレーンテキストエディタ。
// 本文は textarea が描き、装飾だけを 2 枚の canvas に描く:
//   下: 20列超過の背景と 20列ガイド / 上: 空白 (半角 U+0020 / 全角 U+3000) の点線□

const FONT_STACK = '"PafoEdit Mono", monospace';
const FONT_SPEC = '16pt "PafoEdit Mono"';
const LINE_HEIGHT = 30;
const MAX_COLUMNS = 20;
const TAB_SPACES = 4;
const OVERFLOW_COLOR = "rgba(255, 170, 0, 0.38)";
const GUIDE_COLOR = "rgba(128, 128, 128, 0.5)";
const SPACE_BOX_COLOR = "rgba(128, 128, 128, 0.7)";

const WIDE_RANGES = [[0x1100,0x115F], [0x231A,0x231B], [0x2329,0x232A], [0x23E9,0x23EC], [0x23F0,0x23F0], [0x23F3,0x23F3], [0x25FD,0x25FE], [0x2614,0x2615], [0x2630,0x2637], [0x2648,0x2653], [0x267F,0x267F], [0x268A,0x268F], [0x2693,0x2693], [0x26A1,0x26A1], [0x26AA,0x26AB], [0x26BD,0x26BE], [0x26C4,0x26C5], [0x26CE,0x26CE], [0x26D4,0x26D4], [0x26EA,0x26EA], [0x26F2,0x26F3], [0x26F5,0x26F5], [0x26FA,0x26FA], [0x26FD,0x26FD], [0x2705,0x2705], [0x270A,0x270B], [0x2728,0x2728], [0x274C,0x274C], [0x274E,0x274E], [0x2753,0x2755], [0x2757,0x2757], [0x2795,0x2797], [0x27B0,0x27B0], [0x27BF,0x27BF], [0x2B1B,0x2B1C], [0x2B50,0x2B50], [0x2B55,0x2B55], [0x2E80,0x2E99], [0x2E9B,0x2EF3], [0x2F00,0x2FD5], [0x2FF0,0x303E], [0x3041,0x3096], [0x3099,0x30FF], [0x3105,0x312F], [0x3131,0x318E], [0x3190,0x31E5], [0x31EF,0x321E], [0x3220,0x3247], [0x3250,0xA48C], [0xA490,0xA4C6], [0xA960,0xA97C], [0xAC00,0xD7A3], [0xF900,0xFAFF], [0xFE10,0xFE19], [0xFE30,0xFE52], [0xFE54,0xFE66], [0xFE68,0xFE6B], [0xFF01,0xFF60], [0xFFE0,0xFFE6], [0x16FE0,0x16FE4], [0x16FF0,0x16FF1], [0x17000,0x187F7], [0x18800,0x18CD5], [0x18CFF,0x18D08], [0x1AFF0,0x1AFF3], [0x1AFF5,0x1AFFB], [0x1AFFD,0x1AFFE], [0x1B000,0x1B122], [0x1B132,0x1B132], [0x1B150,0x1B152], [0x1B155,0x1B155], [0x1B164,0x1B167], [0x1B170,0x1B2FB], [0x1D300,0x1D356], [0x1D360,0x1D376], [0x1F004,0x1F004], [0x1F0CF,0x1F0CF], [0x1F18E,0x1F18E], [0x1F191,0x1F19A], [0x1F200,0x1F202], [0x1F210,0x1F23B], [0x1F240,0x1F248], [0x1F250,0x1F251], [0x1F260,0x1F265], [0x1F300,0x1F320], [0x1F32D,0x1F335], [0x1F337,0x1F37C], [0x1F37E,0x1F393], [0x1F3A0,0x1F3CA], [0x1F3CF,0x1F3D3], [0x1F3E0,0x1F3F0], [0x1F3F4,0x1F3F4], [0x1F3F8,0x1F43E], [0x1F440,0x1F440], [0x1F442,0x1F4FC], [0x1F4FF,0x1F53D], [0x1F54B,0x1F54E], [0x1F550,0x1F567], [0x1F57A,0x1F57A], [0x1F595,0x1F596], [0x1F5A4,0x1F5A4], [0x1F5FB,0x1F64F], [0x1F680,0x1F6C5], [0x1F6CC,0x1F6CC], [0x1F6D0,0x1F6D2], [0x1F6D5,0x1F6D7], [0x1F6DC,0x1F6DF], [0x1F6EB,0x1F6EC], [0x1F6F4,0x1F6FC], [0x1F7E0,0x1F7EB], [0x1F7F0,0x1F7F0], [0x1F90C,0x1F93A], [0x1F93C,0x1F945], [0x1F947,0x1F9FF], [0x1FA70,0x1FA7C], [0x1FA80,0x1FA89], [0x1FA8F,0x1FAC6], [0x1FACE,0x1FADC], [0x1FADF,0x1FAE9], [0x1FAF0,0x1FAF8], [0x20000,0x2FFFD], [0x30000,0x3FFFD]];

const app = document.getElementById("app");
const editor = document.getElementById("editor");
const underCanvas = document.getElementById("under");
const overCanvas = document.getElementById("over");
const under = underCanvas.getContext("2d");
const over = overCanvas.getContext("2d");

const ZERO_WIDTH = /^[\p{Mn}\p{Me}\p{Cf}]$/u;

const state = {
  half: 0,
  full: 0,
  lineHeight: LINE_HEIGHT,
  width: 0,
  height: 0,
};

const advanceCache = new Map();
const columnCache = new Map();
let cachedLines = null;
let frame = 0;

/* 東アジア幅 W/F の判定 (Python の unicodedata から生成した範囲表) */
function isWide(codePoint) {
  let low = 0;
  let high = WIDE_RANGES.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const [start, end] = WIDE_RANGES[mid];
    if (codePoint < start) high = mid - 1;
    else if (codePoint > end) low = mid + 1;
    else return true;
  }
  return false;
}

function charColumns(ch) {
  let columns = columnCache.get(ch);
  if (columns !== undefined) return columns;
  if (ch === "\t") columns = 1;
  else if (ch === "\n") columns = 0;
  else if (ZERO_WIDTH.test(ch)) columns = 0;
  else columns = isWide(ch.codePointAt(0)) ? 2 : 1;
  columnCache.set(ch, columns);
  return columns;
}

function advance(ch) {
  let width = advanceCache.get(ch);
  if (width === undefined) {
    width = under.measureText(ch).width;
    advanceCache.set(ch, width);
  }
  return width;
}

function getLines() {
  if (cachedLines === null) cachedLines = editor.value.split("\n");
  return cachedLines;
}

function measure() {
  under.font = FONT_SPEC;
  state.half = under.measureText("0").width;
  state.full = under.measureText("\u3000").width;
  advanceCache.clear();
  // フォント読み込み前はフォールバック書体を測るので、比率の警告は読み込み後のみ出す
  if (document.fonts.check(FONT_SPEC) && Math.abs(state.full - 2 * state.half) > 1) {
    console.warn(
      `PafoEdit: full-width ${state.full.toFixed(2)}px is not 2 x ${state.half.toFixed(2)}px; the guide will drift`,
    );
  }
}

/* 20列を超える最初の文字の x。収まる行は null。 */
function overflowStart(line) {
  let column = 0;
  let x = 0;
  for (const ch of line) {
    const width = charColumns(ch);
    if (width && column + width > MAX_COLUMNS) return x;
    column += width;
    x += advance(ch);
  }
  return null;
}

function resizeCanvases() {
  const dpr = window.devicePixelRatio || 1;
  const width = app.clientWidth;
  const height = app.clientHeight;
  state.width = width;
  state.height = height;
  for (const canvas of [underCanvas, overCanvas]) {
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  measure();
  schedule();
}

function visibleRange() {
  const rows = getLines();
  const scrollTop = editor.scrollTop;
  const first = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - 1);
  const last = Math.min(rows.length - 1, first + Math.ceil(state.height / LINE_HEIGHT) + 2);
  return [rows, first, last];
}

function drawUnder() {
  const width = state.width;
  const height = state.height;
  const scrollTop = editor.scrollTop;
  const scrollLeft = editor.scrollLeft;
  under.clearRect(0, 0, width, height);

  const [rows, first, last] = visibleRange();
  under.fillStyle = OVERFLOW_COLOR;
  for (let i = first; i <= last; i += 1) {
    const line = rows[i];
    if (!line) continue;
    const start = overflowStart(line);
    if (start === null) continue;
    const end = under.measureText(line).width;
    const left = Math.max(0, start - scrollLeft);
    const right = Math.min(width, end - scrollLeft);
    if (right <= left) continue;
    under.fillRect(left, i * LINE_HEIGHT - scrollTop, right - left, LINE_HEIGHT);
  }

  // ガイドは超過背景の上に描く (行末の文字に重なっても位置が読めるように)
  const guideX = MAX_COLUMNS * state.half - scrollLeft;
  if (guideX >= 0 && guideX <= width) {
    under.save();
    under.strokeStyle = GUIDE_COLOR;
    under.lineWidth = 1;
    under.setLineDash([4, 3]);
    under.beginPath();
    under.moveTo(Math.round(guideX) + 0.5, 0);
    under.lineTo(Math.round(guideX) + 0.5, height);
    under.stroke();
    under.restore();
  }
}

function drawOver() {
  const width = state.width;
  const height = state.height;
  const scrollTop = editor.scrollTop;
  const scrollLeft = editor.scrollLeft;
  over.clearRect(0, 0, width, height);

  const [rows, first, last] = visibleRange();
  over.save();
  over.strokeStyle = SPACE_BOX_COLOR;
  over.lineWidth = 1;
  over.setLineDash([1, 2]);
  for (let i = first; i <= last; i += 1) {
    const line = rows[i];
    if (!line) continue;
    const top = i * LINE_HEIGHT - scrollTop;
    if (top + LINE_HEIGHT < 0 || top > height) continue;
    let x = 0;
    for (const ch of line) {
      const cell = advance(ch);
      if (ch === " " || ch === "\u3000") {
        const left = x - scrollLeft;
        if (left + cell >= 0 && left <= width) {
          const side = Math.round(Math.min(cell, LINE_HEIGHT) * 0.8);
          over.strokeRect(
            Math.round(left + (cell - side) / 2) + 0.5,
            Math.round(top + (LINE_HEIGHT - side) / 2) + 0.5,
            side - 1,
            side - 1,
          );
        }
      }
      x += cell;
      if (x - scrollLeft > width + 64) break;
    }
  }
  over.restore();
}

function schedule() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    drawUnder();
    drawOver();
  });
}

function sanitize(text) {
  // タブは文書に入れない。貼り付けでは半角空白に展開する。
  return text.replace(/\r\n?/g, "\n").replace(/\t/g, " ".repeat(TAB_SPACES));
}

function insertText(text) {
  const clean = sanitize(text);
  let inserted = false;
  try {
    inserted = document.execCommand("insertText", false, clean);
  } catch {
    inserted = false;
  }
  if (!inserted) {
    const start = editor.selectionStart;
    editor.setRangeText(clean, start, editor.selectionEnd, "end");
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

editor.addEventListener("input", () => {
  cachedLines = null;
  schedule();
});

editor.addEventListener("scroll", schedule, { passive: true });

editor.addEventListener("keydown", (event) => {
  if (event.key === "Tab") {
    event.preventDefault();
  }
});

editor.addEventListener("paste", (event) => {
  const data = event.clipboardData;
  if (!data) return;
  event.preventDefault();
  insertText(data.getData("text/plain"));
});

// ドロップは受け付けない (キャレット位置が取れず、タブ/CRLF の正規化も保証できないため)
for (const type of ["dragover", "drop"]) {
  editor.addEventListener(type, (event) => event.preventDefault());
}

window.addEventListener("resize", resizeCanvases);

if (typeof ResizeObserver === "function") {
  new ResizeObserver(resizeCanvases).observe(app);
}

window.PafoEdit = {
  metrics: () => ({ ...state }),
  charColumns,
  overflowStart,
};

async function boot() {
  try {
    await document.fonts.load(`${FONT_SPEC}`, "あ0");
    await document.fonts.ready;
  } catch (error) {
    console.warn("PafoEdit: font load failed", error);
  }
  if (!document.fonts.check(FONT_SPEC)) {
    console.warn(`PafoEdit: ${FONT_STACK} is not available; using a fallback font`);
  }
  resizeCanvases();
  editor.focus();
}

boot();
