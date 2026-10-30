'use strict';
/* Test the live ESPN feed against a slate file, without touching the board.
 *   node check-espn.js nfl my-slate.json        (contest: nfl, ncaa or nba)
 * Prints, for each game, whether ESPN has it, its status and score, and what it would fill in for the prop. */
const fs = require('fs');
const E = require('./espn.js');
(async () => {
  const [c, file] = process.argv.slice(2);
  if (!E.FEEDS[c] || !file) { console.log('Usage: node check-espn.js <nfl|ncaa|nba> <slate.json>'); process.exit(1); }
  const slate = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log('Asking ESPN (' + E.ESPN_BASE + ') for the ' + c.toUpperCase() + ' scoreboard...');
  let events;
  try { events = await E.getEvents(c); } catch (e) { console.log('FAILED to reach the feed: ' + e.message); process.exit(2); }
  console.log('Feed answered with ' + events.length + ' games.\n');
  let ok = 0; const cache = new Map();
  for (const g of slate.games) {
    const ev = E.matchEvent(g, events);
    const head = String(g.id).padStart(2) + '. ' + g.an + ' @ ' + g.hn;
    if (!ev) { console.log(head + '\n    NOT FOUND in the feed. Team abbreviations or names do not match; fix a/h/an/hn in the slate.\n'); continue; }
    ok++;
    const s = E.sides(ev), es = E.eventState(ev);
    console.log(head + '\n    ESPN: ' + ev.shortName + ' (event ' + ev.id + ') status ' + es.st.toUpperCase() + (es.clk ? ' [' + es.clk + ']' : '') + ', score ' + s.aw.score + '-' + s.hm.score);
    const tp = /team points/i.test(g.ps || '') && /\(([^)]+)\)\s*$/.exec(g.pl || '');
    if (tp) console.log('    Prop (' + g.pl + ' ' + g.ps + '): would use ' + (E.ab(tp[1]) === E.ab(g.a) ? s.aw.score : s.hm.score));
    else if (g.pl) {
      if (es.st === 'pre') console.log('    Prop (' + g.pl + ' ' + g.ps + '): game has not started, nothing to read yet');
      else { const r = await E.propValue(c, ev.id, g, es.st === 'final', cache); console.log('    Prop (' + g.pl + ' ' + g.ps + '): ' + (r.value !== undefined ? 'would fill in ' + r.value + '  (' + r.why + ')' : 'cannot read yet: ' + r.why)); }
    }
    console.log('');
  }
  console.log(ok + ' of ' + slate.games.length + ' games matched the feed.');
})().catch((e) => { console.error(e); process.exit(3); });
