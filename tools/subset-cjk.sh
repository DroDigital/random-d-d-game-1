#!/bin/bash
# Regenerates assets/fonts/ashen-{sc,jp}.woff2: subsets of Noto Serif SC/JP (OFL)
# containing only the characters used by src/i18n/zh.js and ja.js.
# Needs: pip install fonttools brotli, and the two OTFs from
# https://github.com/notofonts/noto-cjk/tree/main/Serif/SubsetOTF (pass their folder as $1).
set -e
DIR=${1:?usage: tools/subset-cjk.sh <folder with NotoSerifSC-Regular.otf and NotoSerifJP-Regular.otf>}
TMP=$(mktemp -d)
node --input-type=module -e "
import zh from './src/i18n/zh.js'; import ja from './src/i18n/ja.js'; import fs from 'fs';
const extra = '　、。・「」『』（）！？：；，～－＋…—';
const chars = (d) => [...new Set([...Object.values(d).join('')].filter((c) => c.codePointAt(0) > 0x2e7f))].join('') + extra;
fs.writeFileSync('$TMP/zh.txt', chars(zh)); fs.writeFileSync('$TMP/ja.txt', chars(ja));"
python3 -m fontTools.subset "$DIR/NotoSerifSC-Regular.otf" --text-file="$TMP/zh.txt" --flavor=woff2 --layout-features='*' --output-file=assets/fonts/ashen-sc.woff2
python3 -m fontTools.subset "$DIR/NotoSerifJP-Regular.otf" --text-file="$TMP/ja.txt" --flavor=woff2 --layout-features='*' --output-file=assets/fonts/ashen-jp.woff2
echo "done"; ls -la assets/fonts
