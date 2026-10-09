import { readFile } from 'node:fs/promises';
import { extractPrograms } from './scraper/extract/index.js';

const BASE = 'https://www.aktion-mensch.de/foerderung/foerderangebote';
const ps = extractPrograms(await readFile('tests/fixtures/sport-kultur.html', 'utf8'), `${BASE}/sport-kultur`);
const p = ps[0]!;
console.log('eligibleCosts:', JSON.stringify(p.conditions.eligibleCosts?.value, null, 1));
console.log('\nrequirements:');
for (const r of p.requirements) console.log(`  [${r.kind}] ${r.heading} -> ${JSON.stringify(r.text.slice(0, 70))}`);
console.log('\ngrant:', JSON.stringify(p.conditions.grant?.value));
console.log('rates:', JSON.stringify(p.conditions.fundingRate?.value));
console.log('coFin:', JSON.stringify(p.conditions.coFinancing?.value));
console.log('duration:', JSON.stringify(p.conditions.maxDuration?.value));
