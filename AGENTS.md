# AGENTS.md

PafoEdit (web): 1行20半角列の固定幅エディタ。静的 HTML/CSS/JS、ビルドなし、サーバーなし。

## 構成

| ファイル | 役割 |
|---|---|
| `web/index.html` | DOM（textarea + 2 枚の canvas） |
| `web/style.css` | `@font-face`、レイヤ、textarea の固定スタイル |
| `web/app.js` | 列計算、超過/ガイド/□の描画、入力制限、貼り付けの正規化 |
| `web/fonts/NotoSansMonoJP-subset.ttf` | 同梱フォント（JIS X 0208 + ASCII + 半角カナ、OFL 1.1） |
| `web/fonts/LICENSE-NotoSansMonoJP.txt` | OFL 全文。フォントを差し替えるときも併置する |
| `web/_headers` | Cloudflare Pages のキャッシュヘッダ |
| `docs/preview.png` | README 用スクリーンショット（公開対象外） |

## 不変条件

- 列数: 行ごと。東アジア幅 W/F = 2列、結合文字・書式文字 (`Mn`/`Me`/`Cf`) = 0列、それ以外 = 1列。改行は加算しない。タブは文書に存在しない（防御的に1列）。
- `WIDE_RANGES` は Python の `unicodedata`（16.0）から生成した範囲表。更新するときは同じ手順で作り直す。
- 20列を超える最初の文字から行末までを琥珀色で塗る。全角が20列目に食い込む場合は、その文字全体を超過扱い（部分着色はしない）。
- ガイドは `20 × 半角セル幅`。`scrollLeft` を引く。超過背景より後に描く（背景に埋もれさせない）。
- **本文は textarea が描く。canvas に本文を描かない。**
  - 下の canvas: 超過背景とガイド
  - 上の canvas: 空白の点線□（`pointer-events: none`）
- 行高は 30px 固定。行の y = `index * 30 - scrollTop`、文字の x = 累積 advance - `scrollLeft`。
  位置は canvas の `measureText` による実測（キャッシュ）で求める。CSS の `ch` や固定係数で近似しない。
- フォントは `@font-face` で `web/fonts` の TTF を読み、`document.fonts.check()` が真になってから 1:2 を検証する。読み込み前に測って警告を出さない。
- タブ: `Tab`/`Shift+Tab` とドラッグ&ドロップを `preventDefault`。貼り付けは CRLF/CR→LF、タブ→半角4空白。挿入は `execCommand("insertText")` で undo 履歴を維持する。
- 永続化・ネットワーク・ビルド工程を追加しない。ファイル入出力は持たない。

## レイヤと座標

- `#app` は `position: fixed; inset: 8px`。textarea は `padding: 0`、`border: 0`、`line-height: 30px`、`wrap="off"`。
- canvas は CSS サイズ 100% のまま、ビットマップを `dpr` 倍にして `setTransform(dpr, 0, 0, dpr, 0, 0)`。座標は CSS px。
- スクロールは textarea の `scrollLeft` / `scrollTop` のみ。canvas 自体はスクロールしない。
- 可視行は `floor(scrollTop / 30)` から `高さ / 30 + 2` 行。超過判定は最初の 21 列までで打ち切る。

## 検証

```sh
python3 -m http.server 8123 --directory web
```

ブラウザで開き、次を確認する。

- `document.fonts.check('16pt "PafoEdit Mono"')` が true。`PafoEdit.metrics()` の `full / half` が 2。
- 20文字ちょうどは無着色、21文字目で着色。Backspace で消える。
- 半角/全角空白のセルに点線□（上の canvas の alpha > 0）。
- ガイドが `20 × half` の位置にあり、横スクロールで追従する。
- `Tab` で本文が変わらない。貼り付けのタブが4空白になる。undo で貼り付けが戻る。
- コピーは textarea のネイティブ動作（アプリ側で `copy` を横取りしない）。

自動化する場合は headless Chromium で `page.evaluate` と `getImageData` を使う。
IME の変換だけは手動確認（`textarea` のネイティブ挙動に依存）。

## デプロイ

- Cloudflare Workers Static Assets（Pages タブが無いダッシュボードの正規ルート）。
- `wrangler.jsonc`: `name = pafoedit`、`assets.directory = ./web`、Worker スクリプトなし。
- Workers Builds: Production branch `main`、Build command `exit 0`、Deploy command `npx wrangler deploy`、非 production のビルドは無効（`desktop` に `web/` が無い）。
- ダッシュボードの Worker 名と `wrangler.jsonc` の `name` を一致させる。変えるときは両方変える。
- 最大資産はフォント 4.06 MiB（25 MiB/ファイル制限内）。
- `_headers` は削除しない。フォントの URL を変えたらキャッシュ名も変える。

## フォント差し替え

1:2 を満たすフォントを `web/fonts` に置き、`style.css` の `@font-face` とライセンスを更新する。
サブセットを作り直した場合は、JIS X 0208 を含めることと、README の収録範囲・サイズを合わせること。
