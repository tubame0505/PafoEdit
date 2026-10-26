#!/usr/bin/env python3
"""PafoEdit: 1行20半角列の制限表示つきプレーンテキストエディタ。

- 固定フォント (Noto Sans Mono CJK JP / 16pt) の等幅グリッドで表示する。
- 1行の表示幅は半角20列。超えた文字には警告色の背景を敷く。
- 空白 (半角 U+0020 / 全角 U+3000) は点線の□で表示する。
- タブ文字は受け付けない (Tab キーは無効、貼り付け時は半角4空白に置換)。
- ファイル入出力は無い。クリップボード (Ctrl+C/V/X) のみ。
"""

from __future__ import annotations

import sys
import unicodedata
from collections.abc import Iterator

from PySide6.QtCore import QMimeData, QPointF, QRectF, Qt
from PySide6.QtGui import (
    QColor,
    QFont,
    QFontInfo,
    QFontMetricsF,
    QKeyEvent,
    QPaintEvent,
    QPainter,
    QPen,
    QSyntaxHighlighter,
    QTextBlock,
    QTextCharFormat,
    QTextCursor,
    QTextDocument,
)
from PySide6.QtWidgets import QApplication, QPlainTextEdit, QWidget

FONT_FAMILY = "Noto Sans Mono CJK JP"
FONT_POINT_SIZE = 16
MAX_COLUMNS = 20
TAB_SPACES = 4
IDEOGRAPHIC_SPACE = "\u3000"
HALF_SPACE = " "
SPACE_CHARACTERS = frozenset({HALF_SPACE, IDEOGRAPHIC_SPACE})

OVERFLOW_BACKGROUND = QColor(255, 170, 0, 96)
GUIDE_COLOR = QColor(128, 128, 128, 130)
SPACE_BOX_COLOR = QColor(128, 128, 128, 180)
SPACE_BOX_INSET_RATIO = 0.1

ZERO_WIDTH_CATEGORIES = frozenset({"Mn", "Me", "Cf"})
_WIDE_WIDTHS = frozenset({"W", "F"})


def char_columns(ch: str) -> int:
    """その文字が占める半角列数 (0/1/2)。

    東アジア幅 W/F を2列、結合文字・書式文字を0列、残りを1列とする。
    改行は行内に現れないので0列。タブは文書に入らないが防御的に1列。
    """
    if ch == "\t":
        return 1
    if ch == "\n":
        return 0
    if unicodedata.category(ch) in ZERO_WIDTH_CATEGORIES:
        return 0
    return 2 if unicodedata.east_asian_width(ch) in _WIDE_WIDTHS else 1


def overflow_index(text: str, limit: int = MAX_COLUMNS) -> int | None:
    """limit 列を超える最初の文字の index。収まっていれば None。

    全角文字が 20 列目に食い込む場合は、その文字全体を超過として扱う。
    """
    column = 0
    for index, ch in enumerate(text):
        width = char_columns(ch)
        if width and column + width > limit:
            return index
        column += width
    return None


class OverflowHighlighter(QSyntaxHighlighter):
    """20列を超えた文字に警告色の背景を敷く (文字の下に描画される)。"""

    def __init__(self, document: QTextDocument) -> None:
        super().__init__(document)
        self._format = QTextCharFormat()
        self._format.setBackground(OVERFLOW_BACKGROUND)

    def highlightBlock(self, text: str) -> None:
        index = overflow_index(text)
        if index is not None:
            self.setFormat(index, len(text) - index, self._format)


class PafoEditor(QPlainTextEdit):
    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        font = QFont(FONT_FAMILY)
        font.setPointSize(FONT_POINT_SIZE)
        font.setStyleHint(QFont.StyleHint.Monospace)
        font.setFixedPitch(True)
        self.setFont(font)

        self._metrics = QFontMetricsF(font)
        self._half_cell = self._metrics.horizontalAdvance("0")
        self._ideographic_cell = self._metrics.horizontalAdvance(IDEOGRAPHIC_SPACE)
        self._check_font(font)

        self.setLineWrapMode(QPlainTextEdit.LineWrapMode.NoWrap)
        self.setTabStopDistance(self._half_cell)
        self._overflow_highlighter = OverflowHighlighter(self.document())

        self.resize(
            int(self._half_cell * MAX_COLUMNS + self._half_cell * 8) + 16,
            int(self._metrics.height() * 21),
        )

    # -- フォントの前提検証 ------------------------------------------------

    def _check_font(self, font: QFont) -> None:
        resolved = QFontInfo(font).family()
        if resolved != FONT_FAMILY:
            print(
                f"warning: {FONT_FAMILY!r} が見つからないため {resolved!r} を使用します",
                file=sys.stderr,
            )
        if abs(self._ideographic_cell - 2.0 * self._half_cell) > 1.0:
            print(
                "warning: 等幅フォントの全角幅が半角幅の2倍ではありません"
                f" (半角 {self._half_cell:.2f}px / 全角 {self._ideographic_cell:.2f}px)",
                file=sys.stderr,
            )

    # -- 入力の制限 --------------------------------------------------------

    def keyPressEvent(self, event: QKeyEvent) -> None:  # noqa: N802 (Qt API)
        if event.key() in (Qt.Key.Key_Tab, Qt.Key.Key_Backtab):
            event.accept()
            return
        super().keyPressEvent(event)

    def insertFromMimeData(self, source: QMimeData) -> None:  # noqa: N802 (Qt API)
        if not source.hasText():
            super().insertFromMimeData(source)
            return
        text = source.text().replace("\r\n", "\n").replace("\r", "\n")
        # タブは文書に入れない。貼り付けでは半角空白に展開する。
        self.insertPlainText(text.replace("\t", " " * TAB_SPACES))

    # -- 表示 --------------------------------------------------------------

    def paintEvent(self, event: QPaintEvent) -> None:  # noqa: N802 (Qt API)
        super().paintEvent(event)
        painter = QPainter(self.viewport())
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        try:
            self._paint_limit_guide(painter)
            self._paint_space_boxes(painter)
        finally:
            painter.end()

    def _paint_limit_guide(self, painter: QPainter) -> None:
        """20列の境界に破線を引く (横スクロールに追従する)。"""
        start = QTextCursor(self.document())
        start.movePosition(QTextCursor.MoveOperation.Start)
        x = self.cursorRect(start).left() + self._half_cell * MAX_COLUMNS
        viewport = self.viewport()
        if x < 0 or x > viewport.width():
            return
        painter.setPen(QPen(GUIDE_COLOR, 1.0, Qt.PenStyle.DashLine))
        painter.setBrush(Qt.BrushStyle.NoBrush)
        painter.drawLine(QPointF(x, 0), QPointF(x, viewport.height()))

    def _paint_space_boxes(self, painter: QPainter) -> None:
        """空白 (半角 U+0020 / 全角 U+3000) のセルに点線の□を描く。"""
        painter.setPen(QPen(SPACE_BOX_COLOR, 1.0, Qt.PenStyle.DotLine))
        painter.setBrush(Qt.BrushStyle.NoBrush)
        for block in self._visible_blocks():
            text = block.text()
            if not SPACE_CHARACTERS.intersection(text):
                continue
            for index, ch in enumerate(text):
                if ch not in SPACE_CHARACTERS:
                    continue
                cell_width = self._half_cell if ch == HALF_SPACE else self._ideographic_cell
                cursor = QTextCursor(block)
                cursor.setPosition(block.position() + index)
                cell = self.cursorRect(cursor)
                # セルに対する比率で内側に縮める (半角/全角で見た目の密度を揃える)
                side = cell_width * (1.0 - 2.0 * SPACE_BOX_INSET_RATIO)
                x = cell.left() + (cell_width - side) / 2.0
                y = cell.top() + (float(cell.height()) - side) / 2.0
                painter.drawRect(QRectF(x, y, side, side))

    def _visible_blocks(self) -> Iterator[QTextBlock]:
        block = self.firstVisibleBlock()
        if not block.isValid():
            return
        viewport_height = self.viewport().height()
        top = self.blockBoundingGeometry(block).translated(self.contentOffset()).top()
        while block.isValid():
            bottom = top + self.blockBoundingRect(block).height()
            if top > viewport_height:
                break
            if block.isVisible() and bottom >= 0:
                yield block
            block = block.next()
            top = bottom


def main(argv: list[str] | None = None) -> int:
    app = QApplication(argv if argv is not None else sys.argv)
    app.setApplicationName("PafoEdit")
    editor = PafoEditor()
    editor.setWindowTitle("PafoEdit")
    editor.show()
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
