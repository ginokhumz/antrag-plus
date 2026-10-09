import * as cheerio from 'cheerio';
import type { Issue, Program, Requirement, RequirementKind } from '@antrag-plus/schema';
import { field } from '@antrag-plus/schema';
import { programId } from '@antrag-plus/schema/id.js';
import { parseQuantities } from '../normalize/quantity.js';
import { CONDITION_HEADINGS, REQUIREMENT_LABELS, matchesLabel } from './labels.js';
import { makeCtx, type PageCtx } from './pageCtx.js';
import { prune } from './prune.js';
import { resolve } from './resolve.js';
import { segment } from './segment.js';
import {
  coFinancingResolvers,
  deadlineResolvers,
  descriptionResolvers,
  durationResolvers,
  eligibleCostResolvers,
  grantResolvers,
  nameResolvers,
  rateResolvers,
} from './resolvers.js';

const KINDS = Object.keys(REQUIREMENT_LABELS) as RequirementKind[];

const PHASE_HEADINGS = ['Dein Weg zum Modellprojekt'];

const requirementsFrom = (ctx: PageCtx): Requirement[] =>
  ctx.headingSections().flatMap(({ heading, text }) => {
    const kind = KINDS.find(k => matchesLabel(heading, REQUIREMENT_LABELS[k]));
    return kind ? [{ kind, heading, text }] : [];
  });

const conditionIssues = (ctx: PageCtx): Issue[] => {
  const t = ctx.section(CONDITION_HEADINGS);
  if (t !== undefined) return parseQuantities(t).issues;

  // Some programmes state their terms per process phase instead of in a conditions
  // block. Conditions has no phase dimension, so a single ceiling would be ambiguous
  // between the phases; the absence is recorded rather than reported as "no terms".
  const phase = ctx.headingSections().find(s => matchesLabel(s.heading, PHASE_HEADINGS));
  if (phase && parseQuantities(phase.text).money.length > 0) {
    return [
      {
        field: 'conditions',
        code: 'phase-scoped-conditions',
        message: `terms stated per process phase under "${phase.heading}"; not representable without a phase dimension`,
      },
    ];
  }
  return [];
};

export const extractPrograms = (html: string, canonicalUrl: string): Program[] => {
  const $ = cheerio.load(html);
  prune($);

  const path = new URL(canonicalUrl).pathname.replace(/\/+$/, '');

  return segment($).map(seg => {
    const ctx = makeCtx(seg.html);
    const issues: Issue[] = [...conditionIssues(ctx)];

    const name = resolve(nameResolvers, ctx) ?? field('', 'site', 'none');
    const shortDescription = resolve(descriptionResolvers, ctx) ?? field('', 'site', 'none');

    const deadline = resolve(deadlineResolvers, ctx);
    if (deadline === undefined) {
      issues.push({ field: 'deadline', code: 'unresolved', message: 'no deadline label or rolling marker found' });
    }

    const grant = resolve(grantResolvers, ctx);
    const fundingRate = resolve(rateResolvers, ctx);
    const coFinancing = resolve(coFinancingResolvers, ctx);
    const maxDuration = resolve(durationResolvers, ctx);
    const eligibleCosts = resolve(eligibleCostResolvers, ctx);

    const facts = Object.fromEntries(
      Object.entries(ctx.allLabelledFacts()).map(([k, v]) => [k, field(v, 'locale', `label:${k}`)]),
    );

    return {
      id: programId(path, seg.sectionId),
      url: seg.sectionId === undefined ? canonicalUrl : `${canonicalUrl}#${seg.sectionId}`,
      name,
      shortDescription,
      deadline: deadline ?? field({ kind: 'unknown' as const }, 'locale', 'none'),
      facts,
      conditions: {
        ...(grant ? { grant } : {}),
        ...(fundingRate ? { fundingRate } : {}),
        ...(coFinancing ? { coFinancing } : {}),
        ...(maxDuration ? { maxDuration } : {}),
        ...(eligibleCosts ? { eligibleCosts } : {}),
      },
      requirements: requirementsFrom(ctx),
      bodySections: ctx.headingSections(),
      issues,
    };
  });
};
