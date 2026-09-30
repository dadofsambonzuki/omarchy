#!/bin/bash

source "$(dirname "$0")/base-test.sh"

require_command node

# The panel's pace arithmetic is plain QML/JavaScript, so it is driven directly
# rather than through a QML runtime: the harness brace-extracts the functions
# out of Panel.qml and calls them against a stub root. What must hold is that
# the window's own length survives limitWindow() and that the elapsed fraction
# and the caption follow from it.
run_node_test <<'JS'
const { execFileSync } = require('child_process')
const fs = require('fs')

const harness = root + '/scripts/agents-pace-harness.js'
const panel = root + '/shell/plugins/agents/Panel.qml'

assert(fs.existsSync(harness), 'the agents pace harness ships with the repo')
assert(fs.existsSync(panel), 'the agents panel is present')

let output = ''
try {
  output = execFileSync('node', [harness, panel], { encoding: 'utf8' })
} catch (error) {
  output = (error.stdout || '') + (error.stderr || '')
  console.error(output)
  assert(false, 'the agents pace harness passes on the panel as shipped')
  process.exit(1)
}

console.log(output.trim())
assert(/^ok - a 5h window with 47m left is ~84% elapsed$/m.test(output), 'a 5h window is paced by the clock')
assert(/^ok - behind when spend lags the clock$/m.test(output), 'a window behind the clock says so')
assert(/^ok - ahead when spend outruns the clock$/m.test(output), 'a window ahead of the clock says so')
assert(/^ok - within a point reads as on pace$/m.test(output), 'a level window reads as on pace')
assert(/^ok - a window with no span has no elapsed position$/m.test(output), 'a window of unknown length is left unpaced')
assert(/^ok - an unspanned window says nothing$/m.test(output), 'a window of unknown length says no caption')
JS
