// usage: node validate.js nfl.json   -> prints OK or the first problem
const { slateError } = require('./feed.js');
const d = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
const e = slateError(d) || (!d.feed ? 'missing "feed" id' : '');
console.log(e ? 'PROBLEM: ' + e : 'OK ' + d.games.length + ' games, feed ' + d.feed);
process.exit(e ? 1 : 0);
