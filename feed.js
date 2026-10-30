'use strict';
/* Weekly slate feed. If SLATE_FEED_URL is set, the server checks <url>/nfl.json, <url>/ncaa.json and <url>/nba.json
 * every 10 minutes. A file is loaded when (a) that contest has no live slate, (b) the file has a "feed" id this server
 * has not loaded before, and (c) it passes the same checks as the Host tab. A live week is never touched. */
const fs = require('fs');
const path = require('path');
const isNum = (v) => typeof v === 'number' && isFinite(v);
function slateError(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.games) || !d.games.length) return 'needs a games list';
  if (d.games.length > 40) return 'too many games';
  const seen = {};
  for (let i = 0; i < d.games.length; i++) {
    const g = d.games[i], n = 'game ' + (i + 1) + ': ';
    if (!g || typeof g !== 'object') return n + 'not a game';
    if (!isNum(g.id) || seen[g.id]) return n + 'bad id';
    seen[g.id] = 1;
    for (const k of ['a', 'h', 'an', 'hn', 'pl', 'ps', 'day']) if (typeof g[k] !== 'string' || !g[k]) return n + 'missing ' + k;
    const bonus = g.hl === undefined && g.tot === undefined;
    for (const k of bonus ? ['pv'] : ['hl', 'tot', 'pv']) if (!isNum(g[k])) return n + k + ' must be a number';
    if (g.k !== 'ou' && g.k !== 'yn') return n + 'bad k';
    if (g.w !== undefined && (!isNum(g.w) || g.w < 1)) return n + 'bad w';
  }
  return '';
}
function start({ url, docs, touch, dataDir, contests }) {
  const seenFile = path.join(dataDir, 'feed-seen.json');
  let seen = {};
  try { seen = JSON.parse(fs.readFileSync(seenFile, 'utf8')); } catch (e) { /* first run */ }
  const base = url.replace(/\/+$/, '');
  const keep = ['id', 'day', 't', 'a', 'h', 'an', 'hn', 'hl', 'tot', 'pl', 'ps', 'pv', 'k', 'w', 'tb'];
  async function check(c) {
    const cur = docs.get('board/' + c + '-slate');
    if (cur && cur.data && Array.isArray(cur.data.games) && cur.data.games.length) { console.log('[feed ' + c + '] week live, skipping'); return; } // a week is live
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 15000);
    let d;
    try {
      const r = await fetch(base + '/' + c + '.json', { signal: ctl.signal, headers: { accept: 'application/json' } });
      if (r.status === 404) return;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      d = await r.json();
    } finally { clearTimeout(to); }
    if (!d || typeof d.feed !== 'string' || !d.feed) return console.log('[feed ' + c + '] file has no "feed" id; skipped');
    if (seen[c] === d.feed) return;
    const err = slateError(d);
    if (err) return console.log('[feed ' + c + '] rejected ' + d.feed + ': ' + err);
    const games = d.games.map((g) => { const o = {}; keep.forEach((k) => { if (g[k] !== undefined) o[k] = g[k]; }); return o; });
    touch('board/' + c + '-slate', { id: 'w' + Date.now().toString(36), title: String(d.title || 'New week').slice(0, 60), locked: false, games });
    seen[c] = d.feed;
    fs.writeFileSync(seenFile, JSON.stringify(seen));
    console.log('[feed ' + c + '] loaded ' + d.feed + ' (' + games.length + ' games)');
  }
  const loop = () => Promise.all(contests.map((c) => check(c).catch((e) => console.log('[feed ' + c + '] ' + (e && e.message))))).then(() => setTimeout(loop, 600000).unref());
  console.log('Weekly slate feed: ' + base);
  setTimeout(loop, 8000).unref();
}
module.exports = { start, slateError };
