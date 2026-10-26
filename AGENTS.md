# AGENTS.md

PafoEdit: 1行20半角列の固定幅エディタ (PySide6 / Python)。ファイル入出力なし、クリップボードのみ。

## 構成

| ファイル | 役割 |
|---|---|
| `pafoedit.py` | アプリ全体。列計算 (`char_columns`, `overflow_index`)、`OverflowHighlighter`、`PafoEditor`、`main()` |
| `test_pafoedit.py` | 列計算・超過判定の単体テスト（GUI 無しで動く） |
| `docs/preview.png` | README 用のスクリーンショット。offscreen で `grab()` して生成 |

単一ファイル構成を維持する。機能追加の要求が無い限り、モジュール分割・設定ファイル・パッケージ化はしない。

## 不変条件（変更時も壊さない）

- 列数: 行ごと。東アジア幅 W/F = 2列、結合文字・書式文字 (`Mn`/`Me`/`Cf`) = 0列、それ以外 = 1列。改行は加算しない。タブは文書に存在しない（防御的に1列）。
- 20列を超える最初の文字から行末までが超過。全角が20列目に食い込む場合はその文字全体を超過扱い（部分着色はしない）。
- 超過の着色は `QSyntaxHighlighter` で行い、文字の下に敷く。オーバーレイ塗りで文字を覆わない。
- `paintEvent` の `super().paintEvent()` の後に viewport へ描くのは「20列ガイド」と「空白 (半角/全角) の点線□」だけ。座標は `QTextCursor` + `cursorRect()` から取る（自前の文字幅計算で x を推定しない）。
- 折り返しは `NoWrap`。1論理行 = 1表示行という前提が列ガイド・点線□・超過表示の座標計算を支えている。
- フォントは定数（`FONT_FAMILY` / `FONT_POINT_SIZE`）で固定し、起動時に「全角幅 ≒ 半角幅×2」を検証して崩れていれば stderr に警告する。検証を外さない。フォントを差し替えるときも 1:2 を満たすものを選ぶ。
- タブ: `Tab`/`Shift+Tab` は無効化し、`insertFromMimeData` でタブを半角4空白へ置換する。貼り付けの CRLF/CR も LF に正規化する。
- ファイル読込・保存・メニュー・検索は実装しない。

## 開発環境の制約

- 作業シェルに X11/Wayland が無い。GUI は必ず offscreen で検証する:
  `QT_QPA_PLATFORM=offscreen`
- 起動確認: `QT_QPA_PLATFORM=offscreen timeout 2 python3 pafoedit.py` → exit 124 ならイベントループまで到達している。
- 描画確認: `QWidget.grab().toImage()` を保存し、`cursorRect()` から求めたセル座標で画素を検査する。座標は viewport 基準なので `viewport().pos()` を加算する。
- 入力・クリップボード: `QTest.keyClick()` と `QApplication.clipboard()` は offscreen でも動く。IME の実変換とシステムクリップボードはこの環境では検証できない。

## 検証手順

```sh
python3 -m unittest -v
QT_QPA_PLATFORM=offscreen timeout 2 python3 pafoedit.py; echo $?   # 124 を期待
```

- 単体テストは純粋関数（列数・超過 index）のみ。GUI の一時的な確認スクリプトはコミットしない。
- 変更した表示（超過背景・点線□・ガイド線）は、offscreen 画像の画素検査で「描かれている」ことと「描かれるべきでない所に描かれていない」ことを両方確認する。
- スクロール（縦・横）後の位置ずれは `cursorRect()` と描画画素の一致で確認する。

## コード規約

- 型ヒントを付ける。コメント・docstring は日本語。
- Qt のオーバーライドは camelCase のまま `# noqa: N802 (Qt API)` を付ける。
- 色・フォント・列数・タブ幅は先頭の定数に集約する。
- `QMimeData` は `PySide6.QtCore`（`QtGui` ではない）。

## 注意点

- `paintEvent` の前に描いても背景塗りで消える。オーバーレイは `super()` の後、`viewport()` に対して描く。
- `QTextCharFormat.setBackground()` のアルファは有効。文字の可読性を保つため不透明色を使わない。
- `cursorRect()` はカーソルを移動させない。スクロール位置に追従する座標を返す。
- 20列ガイドは全行共通の絶対 x（20半角セル分）で描く。行ごとに再計算しない。
