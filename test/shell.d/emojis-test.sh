#!/bin/bash

set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/base-test.sh"

run_node_test <<'JS'
const fs = require('fs')
const emojis = requireFromRoot('shell/plugins/emojis/EmojiSearch.js')

const raw = fs.readFileSync(path.join(root, 'shell/plugins/emojis/emojis.json'), 'utf8')
const data = emojis.parseEmojis(raw)

assert(data.length > 1000, 'emoji dataset parses')
assertDeepEqual(emojis.parseEmojis('{'), [], 'invalid emoji JSON parses as empty list')
assertDeepEqual(emojis.parseEmojis('{"e":"nope"}'), [], 'non-array emoji JSON parses as empty list')

const fixture = [
  { e: 'a', k: 'grinning face smile happy' },
  { e: 'b', k: 'face with tears of joy joy tears' },
  { e: 'c', k: 'flag: united states us america' }
]

assertDeepEqual(
  emojis.filterEmojis(fixture, '  JOY  ').map(item => item.e),
  ['b'],
  'emoji filtering trims and lowercases query'
)

assertDeepEqual(
  emojis.filterEmojis(fixture, '', 2).map(item => item.e),
  ['a', 'b'],
  'emoji filtering honors result limit'
)

assertDeepEqual(
  emojis.filterEmojis(fixture, '', 0),
  [],
  'emoji filtering supports zero result limit'
)

assertEqual(
  emojis.filterEmojis(data, 'face with tears')[0].e,
  '\u{1F602}',
  'emoji filtering finds face with tears of joy'
)

assertDeepEqual(emojis.parseFavorites('["a","b"]'), ['a', 'b'], 'emoji favorites parse in file order')
assertDeepEqual(emojis.parseFavorites('{'), [], 'invalid emoji favorites parse as empty')
assertDeepEqual(emojis.parseFavorites('{"a":1}'), [], 'non-array emoji favorites parse as empty')
assertDeepEqual(
  emojis.parseFavorites('["a","a"," b ",7,null]'),
  ['a', 'b'],
  'emoji favorites drop duplicates, blanks and non-strings'
)

assertDeepEqual(emojis.toggleFavorite(['a'], 'b'), ['a', 'b'], 'favoriting appends so pinned cells stay put')
assertDeepEqual(emojis.toggleFavorite(['a', 'b'], 'a'), ['b'], 'unfavoriting removes the emoji')
assertDeepEqual(emojis.toggleFavorite(null, 'a'), ['a'], 'favoriting tolerates a missing list')
assertDeepEqual(emojis.toggleFavorite(['a'], ''), ['a'], 'favoriting ignores an empty emoji')

assertDeepEqual(emojis.moveFavorite(['a', 'b', 'c'], 'a', 'c'), ['b', 'c', 'a'], 'dragging a favorite forward drops it on the target cell')
assertDeepEqual(emojis.moveFavorite(['a', 'b', 'c'], 'c', 'a'), ['c', 'a', 'b'], 'dragging a favorite back drops it on the target cell')
assertDeepEqual(emojis.moveFavorite(['a', 'b'], 'a', 'a'), ['a', 'b'], 'dropping a favorite on itself changes nothing')
assertDeepEqual(emojis.moveFavorite(['a', 'b'], 'a', 'typo'), ['a', 'b'], 'dropping a favorite outside the list changes nothing')

assertDeepEqual(
  emojis.favoriteEmojis(fixture, ['c', 'a']),
  ['c', 'a'],
  'favorite emojis keep the file order rather than the catalog order'
)

assertDeepEqual(
  emojis.favoriteEmojis(fixture, ['typo', 'b']),
  ['b'],
  'favorite emojis ignore entries outside the catalog'
)

assertDeepEqual(
  emojis.favoriteEmojis(fixture, ['b']),
  ['b'],
  'a short favorite list is not padded out with emojis nobody chose'
)
JS

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

mkdir -p "$TMPDIR/bin"

cat >"$TMPDIR/bin/wl-copy" <<'SH'
#!/bin/bash
args="$*"
target="$WL_COPY_OUT"
if [[ $args == "--type text/plain --sensitive --foreground" ]]; then
  target="$WL_COPY_EMOJI_OUT"
fi

printf '%s\n' "$args" >"$target.args"
cat >"$target"
SH

cat >"$TMPDIR/bin/wtype" <<'SH'
#!/bin/bash
printf '%s\n' "$*" >"$WTYPE_OUT"
SH

cat >"$TMPDIR/bin/sleep" <<'SH'
#!/bin/bash
exit 0
SH

chmod +x "$TMPDIR/bin/wl-copy" "$TMPDIR/bin/wtype" "$TMPDIR/bin/sleep"

WL_COPY_OUT="$TMPDIR/copy" WL_COPY_EMOJI_OUT="$TMPDIR/emoji" WTYPE_OUT="$TMPDIR/wtype" PATH="$TMPDIR/bin:$PATH" \
  "$ROOT/bin/omarchy-menu-emoji-insert" "😀"

[[ $(<"$TMPDIR/emoji") == "😀" ]] || fail "emoji insert helper copies emoji transiently"
pass "emoji insert helper copies emoji transiently"

[[ $(<"$TMPDIR/emoji.args") == "--type text/plain --sensitive --foreground" ]] || fail "emoji insert helper serves sensitive transient clipboard in foreground"
pass "emoji insert helper serves transient clipboard in foreground"

[[ $(<"$TMPDIR/wtype") == "-M shift -k Insert -m shift" ]] || fail "emoji insert helper pastes with shift insert"
pass "emoji insert helper pastes with shift insert"
