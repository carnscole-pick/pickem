'use strict';
/* ESPN's public scoreboard and box score feed (unofficial, no key). Used by the server for live scores and by check-espn.js for testing. */
const ESPN_BASE = (process.env.ESPN_BASE || 'https://site.api.espn.com').replace(/\/$/, '');
const SPORT = { nfl: 'football/nfl', ncaa: 'football/college-football', nba: 'basketball/nba' };
const FEEDS = {
  nfl: '/apis/site/v2/sports/football/nfl/scoreboard',
  ncaa: '/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=400',
  nba: '/apis/site/v2/sports/basketball/nba/scoreboard',
};
const ALIAS = { WAS: 'WSH', JAC: 'JAX', ARZ: 'ARI', OAK: 'LV', STL: 'LAR', SD: 'LAC', GSW: 'GS', NOP: 'NO', NYK: 'NY', SAS: 'SA', PHO: 'PHX', UTH: 'UTAH' };
const ab = (s) => { s = String(s || '').toUpperCase().replace(/[^A-Z0-9&]/g, ''); return ALIAS[s] || s; };
const nm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const pname = (s) => nm(String(s || '').replace(/\b(jr|sr|ii|iii|iv)\b\.?/gi, ''));
function sameTeam(abbr, name, t) {
  if (!t) return false;
  if (abbr && ab(t.abbreviation) === ab(abbr)) return true;
  const n = nm(name);
  return !!n && [t.displayName, t.shortDisplayName, t.location, t.name].some((x) => nm(x) === n);
}

async function getJSON(url, ms) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), ms || 10000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(to); }
}
/* ESPN rejects date ranges (HTTP 400) but accepts a single date. Football: the default is the current week. NBA: ask for each day (Eastern time) from yesterday to tomorrow. */
function etDay(offset) {
  const d = new Date(Date.now() + offset * 864e5);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).replace(/-/g, '');
}
async function getEvents(c) {
  const urls = c === 'nba' ? [-1, 0, 1].map((o) => ESPN_BASE + FEEDS[c] + '?dates=' + etDay(o)) : [ESPN_BASE + FEEDS[c]];
  const res = await Promise.allSettled(urls.map((u) => getJSON(u)));
  const ok = res.filter((r) => r.status === 'fulfilled' && Array.isArray(r.value.events));
  if (!ok.length) { const bad = res.find((r) => r.status === 'rejected'); throw bad ? bad.reason : new Error('unexpected response (no events list)'); }
  const seen = new Set(), out = [];
  for (const r of ok) for (const e of r.value.events) { if (e.id != null) { if (seen.has(e.id)) continue; seen.add(e.id); } out.push(e); }
  return out;
}
function sides(ev) {
  const co = ev && ev.competitions && ev.competitions[0];
  if (!co || !Array.isArray(co.competitors)) return null;
  const aw = co.competitors.find((x) => x.homeAway === 'away'), hm = co.competitors.find((x) => x.homeAway === 'home');
  return aw && hm ? { aw, hm } : null;
}
function matchEvent(g, events) {
  return events.find((e) => { const s = sides(e); return s && sameTeam(g.a, g.an, s.aw.team) && sameTeam(g.h, g.hn, s.hm.team); });
}
function eventState(ev) {
  const type = (ev.status && ev.status.type) || {};
  const st = type.completed || type.state === 'post' ? 'final' : type.state === 'in' ? 'live' : 'pre';
  return { st, clk: st === 'live' ? String(type.shortDetail || (ev.status && ev.status.displayClock) || '').slice(0, 24) : '' };
}

/* ---- player prop stats from the box score ---- */
function statSpec(c, ps) {
  const t = String(ps || '').toLowerCase();
  if (c === 'nba') {
    if (/3\s*-?\s*(pt|pointers?|s)|threes?\b|three/.test(t)) return { cat: null, label: '3PT' };
    if (/\bpoints?\b|\bpts\b/.test(t)) return { cat: null, label: 'PTS' };
    if (/rebounds?|\breb\b/.test(t)) return { cat: null, label: 'REB' };
    if (/assists?|\bast\b/.test(t)) return { cat: null, label: 'AST' };
    if (/steals?|\bstl\b/.test(t)) return { cat: null, label: 'STL' };
    if (/blocks?|\bblk\b/.test(t)) return { cat: null, label: 'BLK' };
    if (/turnovers?/.test(t)) return { cat: null, label: 'TO' };
    return null;
  }
  const yds = /y(ar)?ds?\b/.test(t), td = /\btds?\b|touchdown/.test(t);
  if (/pass/.test(t) && yds) return { cat: 'passing', label: 'YDS' };
  if (/pass/.test(t) && td) return { cat: 'passing', label: 'TD' };
  if (/\bints?\b|interception/.test(t)) return { cat: 'passing', label: 'INT' };
  if (/rush/.test(t) && yds) return { cat: 'rushing', label: 'YDS' };
  if (/rush/.test(t) && td) return { cat: 'rushing', label: 'TD' };
  if (/receptions?|catches/.test(t) || /^rec$/.test(t.trim())) return { cat: 'receiving', label: 'REC' };
  if (/\brec/.test(t) && yds) return { cat: 'receiving', label: 'YDS' };
  if (/\brec/.test(t) && td) return { cat: 'receiving', label: 'TD' };
  return null;
}
async function getBox(c, eventId) {
  const j = await getJSON(ESPN_BASE + '/apis/site/v2/sports/' + SPORT[c] + '/summary?event=' + encodeURIComponent(eventId));
  return j.boxscore && Array.isArray(j.boxscore.players) ? j.boxscore.players : null;
}
/* returns { value, why }. value is undefined when the stat could not be read. */
async function propValue(c, eventId, g, final, boxCache) {
  const spec = statSpec(c, g.ps), m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(g.pl || '');
  if (!spec) return { why: 'stat "' + (g.ps || '') + '" is not one the feed can read (enter it by hand)' };
  if (!m) return { why: 'player name must look like "Name (TEAM)"' };
  let players;
  try { players = boxCache && boxCache.has(eventId) ? boxCache.get(eventId) : await getBox(c, eventId); if (boxCache) boxCache.set(eventId, players); }
  catch (e) { return { why: 'box score request failed (' + e.message + ')' }; }
  if (!players) return { why: 'the feed has no player box score for this game yet' };
  const team = players.find((t) => t.team && ab(t.team.abbreviation) === ab(m[2]));
  if (!team) return { why: 'team "' + m[2] + '" not found in the box score' };
  const want = pname(m[1]), last = want.split(' ').pop();
  const cats = team.statistics || [];
  const cat = spec.cat ? cats.find((x) => String(x.name || '').toLowerCase() === spec.cat) : cats.find((x) => (x.labels || []).map((l) => String(l).toUpperCase()).includes(spec.label));
  if (cat) {
    const labels = (cat.labels || cat.keys || []).map((x) => String(x).toUpperCase());
    const idx = labels.indexOf(spec.label);
    const ath = cat.athletes || [];
    const hit = ath.find((a) => a.athlete && pname(a.athlete.displayName) === want)
      || ath.find((a) => a.athlete && last.length > 3 && pname(a.athlete.displayName).split(' ').pop() === last);
    if (hit && idx >= 0 && Array.isArray(hit.stats) && hit.stats.length) {
      const v = Number(String(hit.stats[idx]).split(/[\/-]/)[0]);
      if (Number.isFinite(v)) return { value: v, why: 'read ' + spec.label + ' = ' + hit.stats[idx] + ' for ' + hit.athlete.displayName };
    }
    if (hit && final) return { value: 0, why: hit.athlete.displayName + ' has no ' + spec.label + ' recorded (did not play); counted as 0' };
  }
  return final ? { value: 0, why: 'player not listed at the final whistle; counted as 0' } : { why: 'player not in the box score yet' };
}
module.exports = { ESPN_BASE, FEEDS, ab, nm, sameTeam, getEvents, matchEvent, eventState, sides, propValue, statSpec, getJSON, SPORT };
