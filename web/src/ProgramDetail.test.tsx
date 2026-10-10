import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProgramDetail } from './ProgramDetail.js';

const f = <T,>(value: T, tier = 'standard', evidence = 'jsonld') => ({ value, tier, evidence });

const programme = {
  id: 'abc',
  url: 'https://x.test/sport-kultur#151880',
  name: f('Sport und Kultur'),
  shortDescription: f('Kurzbeschreibung'),
  deadline: f({ kind: 'unknown' }, 'locale', 'none'),
  facts: { 'Art der Förderung': f('Projektförderung', 'locale', 'label:Art der Förderung') },
  conditions: {},
  requirements: [{ kind: 'exclusions', heading: 'Was wir nicht fördern', text: 'Baukosten' }],
  bodySections: [{ heading: 'Wirkung schaffen', text: 'Der Sozialraum wird inklusiv.' }],
  issues: [{ field: 'deadline', code: 'unresolved', message: 'no deadline label or rolling marker found' }],
};

const renderDetail = () =>
  render(
    <MemoryRouter initialEntries={['/programs/abc']}>
      <Routes>
        <Route path="/programs/:id" element={<ProgramDetail />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => vi.restoreAllMocks());

describe('ProgramDetail', () => {
  it('renders the body sections the spec lists for this view', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(programme))));
    renderDetail();
    await waitFor(() => expect(screen.getByText('Wirkung schaffen')).toBeDefined());
    expect(screen.getByText('Der Sozialraum wird inklusiv.')).toBeDefined();
  });

  it('tells the reader why a field is missing instead of showing a bare dash', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(programme))));
    renderDetail();
    await waitFor(() => expect(screen.getByText(/no deadline label/i)).toBeDefined());
  });

  it('omits the extraction-notes section when a programme has no issues', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...programme, issues: [] }))));
    renderDetail();
    await waitFor(() => expect(screen.getByText('Sport und Kultur')).toBeDefined());
    expect(screen.queryByText(/Hinweise zur Extraktion/i)).toBeNull();
  });

  it('shows an error state when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    renderDetail();
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
  });
});
