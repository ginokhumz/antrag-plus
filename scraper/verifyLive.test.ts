import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { diffAgainstFixtures } from './verifyLive.js';

const urls = { 'https://x.test/a': 'sport-kultur' };

describe('diffAgainstFixtures', () => {
  it('reports nothing when the live page matches the fixture', async () => {
    const fetchText = async () => readFile('tests/fixtures/sport-kultur.html', 'utf8');
    const r = await diffAgainstFixtures({ fixtureDir: 'tests/fixtures', urls, fetchText });
    expect(r.changed).toEqual([]);
    expect(r.unreachable).toEqual([]);
  });

  it('reports the url when the live page differs', async () => {
    const r = await diffAgainstFixtures({ fixtureDir: 'tests/fixtures', urls, fetchText: async () => '<p>neu</p>' });
    expect(r.changed).toEqual(['https://x.test/a']);
  });

  it('reports a page it cannot fetch separately from one that changed', async () => {
    const r = await diffAgainstFixtures({ fixtureDir: 'tests/fixtures', urls, fetchText: async () => undefined });
    expect(r.unreachable).toEqual(['https://x.test/a']);
    expect(r.changed).toEqual([]);
  });

  it('reports a missing fixture as a change rather than passing silently', async () => {
    const r = await diffAgainstFixtures({
      fixtureDir: 'tests/fixtures',
      urls: { 'https://x.test/b': 'does-not-exist' },
      fetchText: async () => '<p>x</p>',
    });
    expect(r.changed).toEqual(['https://x.test/b']);
  });
});
