// Copy Prism Stack's rules engine (the <script id="game-core"> block in
// index.html) into Stackfall, so both games play by identical rules.
// Run after changing the engine:   node tools/sync-engine.js
// The test suite fails if the two copies ever differ.
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const RE = /<script id="game-core">[\s\S]*?<\/script>/;
const prismFile = path.join(root, 'index.html');
const sfFile = path.join(root, 'stackfall', 'index.html');

const prism = fs.readFileSync(prismFile, 'utf8');
const sf = fs.readFileSync(sfFile, 'utf8');
const core = prism.match(RE);
if (!core) throw new Error('No game-core script in index.html');
if (!RE.test(sf)) throw new Error('No game-core script in stackfall/index.html');

const out = sf.replace(RE, () => core[0]);
if (out === sf) {
  console.log('Stackfall engine already up to date.');
} else {
  fs.writeFileSync(sfFile, out);
  console.log('Copied the engine into stackfall/index.html.');
}
