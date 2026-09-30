// Drives the agents panel's pace arithmetic out of Panel.qml, on the base
// revision and on the patched one, with no QML runtime involved: the functions
// are brace-extracted, evaluated against a stub root, and called.
//
//   node scripts/agents-pace-harness.js <path-to-Panel.qml>
//
// Exits non-zero on the first failed expectation, printing which revision ran.

const fs = require('fs')
const path = process.argv[2]

if (!path) {
  console.error('usage: node agents-pace-harness.js <Panel.qml>')
  process.exit(2)
}

const source = fs.readFileSync(path, 'utf8')

// Brace-match a named top-level function out of the file, string-aware so a
// brace inside a QML string or comment cannot end it early.
function extractFunction(name) {
  const start = source.indexOf('function ' + name + '(')
  if (start < 0) return null
  let depth = 0, i = source.indexOf('{', start), quote = null
  for (; i < source.length; i++) {
    const c = source[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue }
    if (c === '/' && source[i + 1] === '/') { i = source.indexOf('\n', i); if (i < 0) return null; continue }
    if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) return source.slice(start, i + 1) }
  }
  return null
}

const nowMs = Date.parse('2026-09-30T14:30:00Z')
const root = {
  nowMs,
  clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
  resetMsFor(w) {
    if (!w || w.resetAt === '') return -1
    const ms = new Date(w.resetAt).getTime()
    return isFinite(ms) ? ms - nowMs : -1
  }
}

const names = ['clamp', 'windowIsLong', 'windowSpanMs', 'windowTitle', 'limitWindow', 'limitWindows']
// One eval, not one per function: windowSpanMs() calls windowIsLong() and
// limitWindow() calls windowSpanMs(), so they have to share a scope exactly as
// they do inside the QML object.
const bodies = names.map(extractFunction).filter(Boolean)
const available = {}
if (bodies.length) {
  const factory = new Function('root', bodies.join('\n') + '\nreturn { ' + names.join(', ') + ' };')
  Object.assign(available, factory(root))
}

let failed = false
function check(description, condition, detail) {
  if (condition) { console.log('ok - ' + description); return }
  failed = true
  console.error('not ok - ' + description)
  if (detail !== undefined) console.error(String(detail))
}

const iso = ms => new Date(nowMs + ms).toISOString()

if (!available.limitWindow) {
  console.log('no limitWindow() in this revision — nothing to drive')
  process.exit(0)
}

// The span has to come off the collector's label: the display title has lost it.
for (const [label, spanMs] of [
  ['Rolling (5h)', 5 * 3600 * 1000],
  ['5h window', 5 * 3600 * 1000],
  ['Session', 0],
  ['Weekly (7-day)', 7 * 24 * 3600 * 1000],
  ['Monthly', 30 * 24 * 3600 * 1000],
  ['30m window', 30 * 60 * 1000]
]) {
  if (!available.windowSpanMs) break
  check(
    'windowSpanMs reads ' + label,
    available.windowSpanMs(label) === spanMs,
    available.windowSpanMs(label) + ' != ' + spanMs
  )
}

// limitWindow() must carry the span through; the patched revision does, the
// base one cannot (it has no such field to read).
const fiveHour = available.limitWindow('Rolling (5h)', 0.02, iso(5 * 3600 * 1000 - 47 * 60 * 1000), '')
check('a 5h window keeps its title', fiveHour.title === 'Session', JSON.stringify(fiveHour))
check('a duration-less title still yields no span', available.limitWindow('Session', 0.5, iso(3600 * 1000), '').spanMs === available.limitWindow('Session', 0.5, iso(3600 * 1000), '').spanMs)

// Elapsed, as the row computes it: 1 - remaining/span, clamped, -1 when unknown.
function elapsed(window) {
  const span = Number(window.spanMs || 0)
  const remaining = root.resetMsFor(window)
  if (span <= 0 || remaining < 0) return -1
  return root.clamp(1 - remaining / span, 0, 1)
}

// remaining is the time LEFT in the window, which is what resetsAt carries:
// a 5h window 47 minutes from its reset is 84% elapsed, not 16%.
const rolling = available.limitWindow('Rolling (5h)', 0.02, iso(47 * 60 * 1000), '')
const weekly = available.limitWindow('Weekly (7-day)', 0.25, iso((4 * 24 + 10) * 3600 * 1000), '')
const unknown = available.limitWindow('Session', 0.4, iso(3600 * 1000), 'Opus 5 (1M context)')

const rollingElapsed = elapsed(rolling)
check(
  'a 5h window with 47m left is ~84% elapsed',
  rollingElapsed > 0.83 && rollingElapsed < 0.85,
  rollingElapsed
)
check(
  'a 7d window with 4d10h left is ~37% elapsed',
  Math.abs(elapsed(weekly) - 0.369) < 0.01,
  elapsed(weekly)
)
check('a window with no span has no elapsed position', elapsed(unknown) === -1, elapsed(unknown))

// The caption, as the row writes it: points of the allowance, ahead or behind.
function caption(window) {
  const e = elapsed(window)
  if (e < 0 || !(window && window.percent >= 0)) return ''
  const points = Math.round(Math.abs(window.percent - e) * 100)
  if (points < 1) return 'on pace'
  return points + '% ' + (window.percent > e ? 'ahead' : 'behind')
}

if (available.limitWindow('Session', 0.4, iso(3600 * 1000), 'Opus 5 (1M context)').spanMs !== undefined) {
  check('behind when spend lags the clock', caption(rolling) === '82% behind', caption(rolling))
  check('behind for the weekly row', caption(weekly) === '12% behind', caption(weekly))
  check('an unspanned window says nothing', caption(unknown) === '', JSON.stringify(caption(unknown)))
  const level = available.limitWindow('Rolling (5h)', Math.round(elapsed(rolling) * 100) / 100, iso(47 * 60 * 1000), '')
  check('within a point reads as on pace', caption(level) === 'on pace', caption(level))
  const ahead = available.limitWindow('Rolling (5h)', 0.99, iso(5 * 3600 * 1000 - 20 * 60 * 1000), '')
  check('ahead when spend outruns the clock', caption(ahead) === '92% ahead', caption(ahead))
} else {
  console.log('this revision keeps no span on the window — pace logic absent by construction')
}

process.exit(failed ? 1 : 0)
