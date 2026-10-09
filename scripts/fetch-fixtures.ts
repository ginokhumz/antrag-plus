import { writeFile, mkdir } from 'node:fs/promises';

const UA = 'antrag-plus-fixtures/1.0 (job application exercise)';
const BASE = 'https://www.aktion-mensch.de';
const PROGRAMMES = [
  'sport-kultur',
  'junge-menschen',
  'anschubfoerderung-arbeit',
  'pauschalfoerderung',
  'zeichen-setzen',
  'aktion-mensch-stiftung',
];

const get = async (path: string): Promise<string> => {
  const res = await fetch(`${BASE}${path}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.text();
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

await mkdir('tests/fixtures', { recursive: true });
await writeFile('tests/fixtures/robots.txt', await get('/robots.txt'));
await sleep(1000);
await writeFile('tests/fixtures/sitemap-index.xml', await get('/index-sitemap.xml'));
await sleep(1000);
await writeFile('tests/fixtures/sitemap-meta.xml', await get('/meta/sitemap.xml'));
await sleep(1000);
await writeFile('tests/fixtures/listing.html', await get('/foerderung/foerderangebote'));
for (const slug of PROGRAMMES) {
  await sleep(1000);
  await writeFile(`tests/fixtures/${slug}.html`, await get(`/foerderung/foerderangebote/${slug}`));
}
console.log('fixtures written');
