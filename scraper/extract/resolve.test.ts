import { describe, it, expect } from 'vitest';
import { resolve, type Resolver } from './resolve.js';
import { makeCtx } from './pageCtx.js';

const ctx = makeCtx('<html><body><p class="prose">Ein Satz.</p></body></html>');

describe('resolve', () => {
  it('returns the first hit with its tier and evidence', () => {
    const rs: Resolver<string>[] = [
      { tier: 'standard', name: 'a', run: () => undefined },
      { tier: 'locale', name: 'b', run: () => 'value' },
      { tier: 'site', name: 'c', run: () => 'never reached' },
    ];
    expect(resolve(rs, ctx)).toEqual({ value: 'value', tier: 'locale', evidence: 'b' });
  });

  it('returns undefined when nothing resolves', () => {
    expect(resolve([{ tier: 'site', name: 'a', run: () => undefined }], ctx)).toBeUndefined();
  });

  it('skips a resolver that throws and continues down the chain', () => {
    const rs: Resolver<string>[] = [
      { tier: 'standard', name: 'boom', run: () => { throw new Error('bad selector'); } },
      { tier: 'locale', name: 'ok', run: () => 'value' },
    ];
    expect(resolve(rs, ctx)?.tier).toBe('locale');
  });

  it('treats an empty string as no hit, so a blank element does not win over a later tier', () => {
    const rs: Resolver<string>[] = [
      { tier: 'standard', name: 'blank', run: () => '' },
      { tier: 'locale', name: 'ok', run: () => 'value' },
    ];
    expect(resolve(rs, ctx)?.value).toBe('value');
  });

  it('treats an empty array as no hit', () => {
    const rs: Resolver<string[]>[] = [
      { tier: 'standard', name: 'empty', run: () => [] },
      { tier: 'locale', name: 'ok', run: () => ['x'] },
    ];
    expect(resolve(rs, ctx)?.value).toEqual(['x']);
  });
});

describe('resolve — a throwing resolver is reported, not swallowed', () => {
  it('records the resolver that threw', () => {
    const thrown: { name: string; message: string }[] = [];
    const rs: Resolver<string>[] = [
      { tier: 'standard', name: 'boom', run: () => { throw new Error('bad selector'); } },
      { tier: 'locale', name: 'ok', run: () => 'value' },
    ];
    const got = resolve(rs, ctx, e => thrown.push(e));
    expect(got?.value).toBe('value');
    expect(thrown).toEqual([{ name: 'boom', message: 'bad selector' }]);
  });

  it('still works without a reporter', () => {
    const rs: Resolver<string>[] = [{ tier: 'standard', name: 'boom', run: () => { throw new Error('x'); } }];
    expect(resolve(rs, ctx)).toBeUndefined();
  });
});
