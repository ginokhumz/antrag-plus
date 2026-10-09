import express from 'express';
import type { Program, RunReport } from '@antrag-plus/schema';
import { loadSnapshot } from './snapshot.js';

const listEntry = (p: Program) => ({
  id: p.id,
  url: p.url,
  name: p.name,
  shortDescription: p.shortDescription,
  deadline: p.deadline,
  conditions: p.conditions,
});

export const createApp = (snapshot: { programmes: Program[]; report: RunReport }): express.Express => {
  const app = express();
  const byId = new Map(snapshot.programmes.map(p => [p.id, p]));

  app.get('/api/programs', (_req, res) => {
    res.json(snapshot.programmes.map(listEntry));
  });

  app.get('/api/programs/:id', (req, res) => {
    const found = byId.get(req.params.id);
    if (!found) {
      res.status(404).json({ error: { code: 'not-found', message: `no programme with id ${req.params.id}` } });
      return;
    }
    res.json(found);
  });

  app.get('/api/meta', (_req, res) => {
    res.json(snapshot.report);
  });

  return app;
};

if (process.argv[1]?.endsWith('server/index.ts')) {
  try {
    const snapshot = await loadSnapshot('data');
    const port = Number(process.env['PORT'] ?? 3001);
    createApp(snapshot).listen(port, () => {
      console.log(`api on http://localhost:${port} — ${snapshot.programmes.length} programmes`);
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
