import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProgramList } from './ProgramList.js';

const entry = (id: string, name: string) => ({
  id,
  url: `https://x.test/${name}`,
  name: { value: name, tier: 'standard', evidence: 'jsonld' },
  shortDescription: { value: 'Kurz', tier: 'standard', evidence: 'jsonld' },
  deadline: { value: { kind: 'unknown' }, tier: 'locale', evidence: 'none' },
  conditions: {},
});

const renderList = () => render(<MemoryRouter><ProgramList /></MemoryRouter>);

beforeEach(() => vi.restoreAllMocks());

describe('ProgramList', () => {
  it('renders one entry per programme', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([entry('a', 'Erstes'), entry('b', 'Zweites')]))));
    renderList();
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
  });

  it('shows a loading state before the data arrives', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    renderList();
    expect(screen.getByText(/lädt/i)).toBeDefined();
  });

  it('shows an error state when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    renderList();
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
  });

  it('links each entry to its detail route by id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([entry('abc', 'Erstes')]))));
    renderList();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Erstes/ }).getAttribute('href')).toBe('/programs/abc');
    });
  });
});
