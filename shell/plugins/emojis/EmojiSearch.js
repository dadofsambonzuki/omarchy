function parseEmojis(raw) {
  try {
    var data = JSON.parse(String(raw || ""))
    return Array.isArray(data) ? data : []
  } catch (e) {
    return []
  }
}

// Favorites are a hand-ordered list, e.g. ["👍", "🔥"]. The file order is the
// on-screen order, so a pinned emoji is always in the cell you remember.
function parseFavorites(raw) {
  var out = []
  try {
    var data = JSON.parse(String(raw || ""))
    if (Array.isArray(data)) {
      for (var i = 0; i < data.length; i++) {
        var emoji = typeof data[i] === "string" ? data[i].trim() : ""
        if (emoji && out.indexOf(emoji) < 0) out.push(emoji)
      }
    }
  } catch (e) {}
  return out
}

// Adding appends, so pinning a new emoji never moves the ones already there.
function toggleFavorite(favorites, emoji) {
  var list = Array.isArray(favorites) ? favorites.slice() : []
  if (!emoji) return list
  var at = list.indexOf(emoji)
  if (at >= 0) list.splice(at, 1)
  else list.push(emoji)
  return list
}

// Drops `emoji` into the slot `before` holds now: the pins it passes move up,
// so the emoji lands in the cell the pointer was released over.
function moveFavorite(favorites, emoji, before) {
  var list = Array.isArray(favorites) ? favorites.slice() : []
  var from = list.indexOf(emoji)
  var to = list.indexOf(before)
  if (from < 0 || to < 0 || from === to) return list
  list.splice(from, 1)
  list.splice(to, 0, emoji)
  return list
}

// Only emojis in the catalog can render, so a mistyped entry never takes a cell.
// A pinned list is shown as it is: three favorites are three cells, not a row
// padded out with emojis nobody chose.
function favoriteEmojis(emojis, favorites) {
  var catalog = (Array.isArray(emojis) ? emojis : []).map(function(item) { return item && item.e })
  var list = Array.isArray(favorites) ? favorites : []
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (catalog.indexOf(list[i]) >= 0 && out.indexOf(list[i]) < 0) out.push(list[i])
  }
  return out
}

function normalizedQuery(query) {
  return String(query || "").trim().toLowerCase()
}

function keywordText(item) {
  return String((item && item.k) || "").toLowerCase()
}

function filterEmojis(emojis, query, limit) {
  var values = Array.isArray(emojis) ? emojis : []
  var needle = normalizedQuery(query)
  var max = limit === undefined || limit === null ? 1000 : Number(limit)
  if (isNaN(max)) max = 1000
  max = Math.max(0, max)
  if (max === 0) return []

  var out = []

  for (var i = 0; i < values.length; i++) {
    var item = values[i]
    if (!item || !item.e) continue
    if (!needle || keywordText(item).indexOf(needle) >= 0) {
      out.push(item)
      if (out.length >= max) break
    }
  }

  return out
}

if (typeof module !== "undefined") {
  module.exports = {
    parseEmojis: parseEmojis,
    parseFavorites: parseFavorites,
    toggleFavorite: toggleFavorite,
    moveFavorite: moveFavorite,
    favoriteEmojis: favoriteEmojis,
    normalizedQuery: normalizedQuery,
    filterEmojis: filterEmojis
  }
}
