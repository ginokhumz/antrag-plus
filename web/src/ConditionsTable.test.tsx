import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConditionsTable } from './ConditionsTable.js';

const f = <T,>(value: T) => ({ value, tier: 'locale' as const, evidence: 'section' });

describe('ConditionsTable', () => {
  it('shows a grant with its bound and basis, never a bare figure', () => {
    render(<ConditionsTable conditions={{ grant: f([{ amountEur: 50000, bound: 'max' as const, per: 'project' as const }]) }} />);
    expect(screen.getByText(/max\. 50\.000 € pro Projekt/)).toBeDefined();
  });

  it('distinguishes a per-person-day rate from a project ceiling', () => {
    render(<ConditionsTable conditions={{ grant: f([{ amountEur: 50, bound: 'exact' as const, per: 'person-day' as const }]) }} />);
    expect(screen.getByText(/50 € pro Person und Tag/)).toBeDefined();
  });

  it('shows a co-financing floor as a minimum', () => {
    render(<ConditionsTable conditions={{ coFinancing: f([{ percent: 10, bound: 'min' as const, of: 'own-funds' as const }]) }} />);
    expect(screen.getByText(/min\. 10 % Eigenmittel/)).toBeDefined();
  });

  it('shows a duration in months', () => {
    render(<ConditionsTable conditions={{ maxDuration: f({ months: 48, bound: 'max' as const }) }} />);
    expect(screen.getByText(/max\. 48 Monate/)).toBeDefined();
  });

  it('lists each eligible cost category as its own row', () => {
    render(<ConditionsTable conditions={{ eligibleCosts: f(['Personalkosten', 'Sachkosten']) }} />);
    expect(screen.getByText('Personalkosten')).toBeDefined();
    expect(screen.getByText('Sachkosten')).toBeDefined();
  });

  it('says so plainly when a programme states no conditions of its own', () => {
    render(<ConditionsTable conditions={{}} />);
    expect(screen.getByText(/keine eigenen Förderkonditionen angegeben/i)).toBeDefined();
  });
});
