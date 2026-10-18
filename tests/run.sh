#!/bin/sh
# 用法：sh tests/run.sh [style|batch|full] [--tab=id,…] [--mod=risk,mcrpc,…] [--wide]
#  style：只改外觀或排版 → 靜態＋快照比對（snap.txt 必須是改前版本，且必須完全相同）＋e2e 快速
#  batch：一般批次     → 靜態＋快照（有差異時列出，確認後覆蓋 snap.txt）＋組合模擬（--mod 指定模組）＋e2e 快速＋--tab 分頁完整操作
#         改到版面或 CSS 結構時加 --wide（加跑 320／768）
#  full ：v1.0         → 靜態＋快照＋全部模組組合模擬＋e2e --full
# 只印失敗摘要。分頁 id：calc dx risk loc adv mon drug ref；模組：all risk mhspc nmcrpc mcrpc mon
cd "$(dirname "$0")/.." || exit 1
MODE=${1:-style}; [ $# -gt 0 ] && shift
TAB=""; MOD=""; WIDE=""
for a in "$@"; do case "$a" in --tab=*) TAB="$a";; --mod=*) MOD="$a";; --wide) WIDE="--wide";; esac; done
rc=0
node tests/static.js index.html || rc=1
node tests/snap.js index.html tests/snap.new.txt >/dev/null || { echo "SNAP 輸出含 undefined／NaN／例外"; rc=1; }
if [ -f tests/snap.txt ]; then
  # 版本號與查證日期不列入比對
  F='s/v[0-9]\+\.[0-9]\+//g; s/20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]//g'
  sed "$F" tests/snap.txt > tests/.a.tmp; sed "$F" tests/snap.new.txt > tests/.b.tmp
  if diff -q tests/.a.tmp tests/.b.tmp >/dev/null; then echo "SNAP 相同"; rm -f tests/snap.new.txt; else
    echo "SNAP 有差異（style 模式必須相同；batch 模式確認後：mv tests/snap.new.txt tests/snap.txt）："
    diff tests/snap.txt tests/snap.new.txt | grep '^[<>]' | cut -c1-200 | head -20
    [ "$MODE" = style ] && rc=1; fi
  rm -f tests/.a.tmp tests/.b.tmp
else mv tests/snap.new.txt tests/snap.txt; echo "SNAP 建立 tests/snap.txt"; fi
case "$MODE" in
  style) ;;
  batch) [ -n "$MOD" ] && { node tests/fuzz.js index.html "$MOD" || rc=1; };;
  full)  node tests/fuzz.js index.html --n=5000 || rc=1;;
esac
case "$MODE" in
  full) python3 tests/e2e.py index.html --full || rc=1;;
  *)    python3 tests/e2e.py index.html $TAB $WIDE || rc=1;;
esac
[ $rc = 0 ] && echo "ALL OK"
exit $rc
