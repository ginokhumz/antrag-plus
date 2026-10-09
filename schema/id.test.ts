import { describe, it, expect } from 'vitest';
import { programId } from './id.js';

describe('programId', () => {
  it('is stable across calls, which is what a random v4 would break', () => {
    const a = programId('/foerderung/foerderangebote/sport-kultur');
    const b = programId('/foerderung/foerderangebote/sport-kultur');
    expect(a).toBe(b);
  });

  it('returns a v5 uuid', () => {
    expect(programId('/x')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('distinguishes two sub-programmes on the same path', () => {
    const a = programId('/foerderung/foerderangebote/pauschalfoerderung', '151880');
    const b = programId('/foerderung/foerderangebote/pauschalfoerderung', '151904');
    expect(a).not.toBe(b);
  });

  it('distinguishes a sub-programme from the bare page', () => {
    const bare = programId('/foerderung/foerderangebote/pauschalfoerderung');
    const sub = programId('/foerderung/foerderangebote/pauschalfoerderung', '151880');
    expect(bare).not.toBe(sub);
  });

  it('distinguishes two different paths', () => {
    expect(programId('/a')).not.toBe(programId('/b'));
  });

  it('ignores a trailing slash so one programme keeps one id', () => {
    expect(programId('/a/')).toBe(programId('/a'));
  });
});
