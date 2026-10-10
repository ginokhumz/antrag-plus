import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeadlineBadge } from './DeadlineBadge.js';

describe('DeadlineBadge', () => {
  it('renders a window as a German end date', () => {
    render(<DeadlineBadge deadline={{ kind: 'window', start: '2026-09-01', end: '2026-10-15' }} />);
    expect(screen.getByText('bis 15.10.2026')).toBeDefined();
  });

  it('renders rolling as laufend', () => {
    render(<DeadlineBadge deadline={{ kind: 'rolling', cadence: 'sechs Mal jährlich' }} />);
    expect(screen.getByText(/laufend/)).toBeDefined();
  });

  it('shows the cadence when stated', () => {
    render(<DeadlineBadge deadline={{ kind: 'rolling', cadence: 'sechs Mal jährlich' }} />);
    expect(screen.getByText(/sechs Mal jährlich/)).toBeDefined();
  });

  it('renders unknown as a dash rather than as a missing deadline', () => {
    render(<DeadlineBadge deadline={{ kind: 'unknown' }} />);
    expect(screen.getByText('—')).toBeDefined();
  });

  it('gives each kind a distinct data attribute so the three cases are visibly different', () => {
    const { container: w } = render(<DeadlineBadge deadline={{ kind: 'window', end: '2026-10-15' }} />);
    const { container: r } = render(<DeadlineBadge deadline={{ kind: 'rolling' }} />);
    const { container: u } = render(<DeadlineBadge deadline={{ kind: 'unknown' }} />);
    const kinds = [w, r, u].map(c => c.querySelector('[data-deadline]')?.getAttribute('data-deadline'));
    expect(kinds).toEqual(['window', 'rolling', 'unknown']);
  });
});
