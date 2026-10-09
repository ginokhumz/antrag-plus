import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseRobots } from './robots.js';

const body = await readFile('tests/fixtures/robots.txt', 'utf8');

describe('parseRobots', () => {
  it('allows the funding path this scraper targets', () => {
    expect(parseRobots(body).allow('/foerderung/foerderangebote')).toBe(true);
  });

  it('honours a disallowed path', () => {
    expect(parseRobots(body).allow('/webservices/anything')).toBe(false);
  });

  it('collects the declared sitemaps', () => {
    expect(parseRobots(body).sitemaps).toContain('https://www.aktion-mensch.de/index-sitemap.xml');
  });

  it('allows everything when there are no rules', () => {
    expect(parseRobots('').allow('/anything')).toBe(true);
  });

  it('treats a wildcard disallow as blocking', () => {
    expect(parseRobots('User-agent: *\nDisallow: /').allow('/foerderung')).toBe(false);
  });
});
