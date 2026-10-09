import { describe, it, expect } from 'vitest';
import { canonicalUrl } from './canonicalUrl.js';

describe('canonicalUrl', () => {
  it('strips a trailing slash so two spellings collapse to one', () => {
    expect(canonicalUrl('https://www.aktion-mensch.de/foerderung/x/')).toBe(
      'https://www.aktion-mensch.de/foerderung/x',
    );
  });

  it('lowercases the host but not the path', () => {
    expect(canonicalUrl('https://WWW.Aktion-Mensch.DE/Foerderung/X')).toBe(
      'https://www.aktion-mensch.de/Foerderung/X',
    );
  });

  it('decodes percent-encoded path segments', () => {
    expect(canonicalUrl('https://x.test/f%C3%B6rderung')).toBe('https://x.test/förderung');
  });

  it('drops the query string', () => {
    expect(canonicalUrl('https://x.test/a?utm_source=news')).toBe('https://x.test/a');
  });

  it('drops the fragment', () => {
    expect(canonicalUrl('https://x.test/a#151880')).toBe('https://x.test/a');
  });

  it('resolves a relative path against the base', () => {
    expect(canonicalUrl('/foerderung/x', 'https://x.test/listing')).toBe('https://x.test/foerderung/x');
  });

  it('returns undefined for a non-http scheme', () => {
    expect(canonicalUrl('mailto:a@b.test')).toBeUndefined();
    expect(canonicalUrl('javascript:void(0)')).toBeUndefined();
  });

  it('returns undefined for unparseable input', () => {
    expect(canonicalUrl('not a url')).toBeUndefined();
  });
});
