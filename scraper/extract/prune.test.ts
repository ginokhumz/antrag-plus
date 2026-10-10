import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import * as cheerio from 'cheerio';
import { prune } from './prune.js';

const load = async (name: string) => {
  const $ = cheerio.load(await readFile(`tests/fixtures/${name}.html`, 'utf8'));
  prune($);
  return $;
};

describe('prune — aktion-mensch-stiftung, the page where an unpruned scan succeeds and is wrong', () => {
  it('removes the promo call-to-action that reads like a conditions heading', async () => {
    const $ = await load('aktion-mensch-stiftung');
    expect($.root().text()).not.toContain('Förderkonditionen kennenlernen');
  });

  it('removes the example-project amount that belongs to another organisation', async () => {
    const body = (await load('aktion-mensch-stiftung')).root().text();
    expect(body).not.toContain('450.000');
  });

  it('keeps the programme own phase figures, which are not example-project amounts', async () => {
    const body = (await load('aktion-mensch-stiftung')).root().text();
    expect(body).toContain('600.000');
    expect(body).toContain('Dein Weg zum Modellprojekt');
  });

  it('removes the two promo sections that would look like programme boundaries', async () => {
    const body = (await load('aktion-mensch-stiftung')).root().text();
    expect(body).not.toContain('Über die Stiftung');
    expect(body).not.toContain('Du hast Fragen?');
  });

  it('keeps the page own requirements', async () => {
    expect((await load('aktion-mensch-stiftung')).root().text()).toContain('Unsere Anforderungen');
  });
});

describe('prune — the other pages keep their own content', () => {
  it('keeps the conditions heading on sport-kultur', async () => {
    expect((await load('sport-kultur')).root().text()).toContain('Unsere Konditionen');
  });

  it('keeps the grant amount on sport-kultur', async () => {
    expect((await load('sport-kultur')).root().text()).toContain('50.000');
  });

  it('removes the project-idea examples from sport-kultur', async () => {
    expect((await load('sport-kultur')).root().text()).not.toContain('Projektideen für dich');
  });

  it('removes the newsletter and footer navigation from every page', async () => {
    for (const name of ['sport-kultur', 'junge-menschen', 'pauschalfoerderung']) {
      const body = (await load(name)).root().text();
      expect(body).not.toContain('Beliebte Seiten');
    }
  });

  it('keeps both conditions headings on pauschalfoerderung', async () => {
    const body = (await load('pauschalfoerderung')).root().text();
    expect(body.match(/Förderkonditionen/g)).toHaveLength(2);
  });
});
