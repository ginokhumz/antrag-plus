export const parseRobots = (body: string): { allow(path: string): boolean; sitemaps: string[] } => {
  const sitemaps: string[] = [];
  const disallowed: string[] = [];
  let appliesToUs = false;

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [keyPart, ...rest] = line.split(':');
    const key = keyPart!.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'sitemap') sitemaps.push(value);
    else if (key === 'user-agent') appliesToUs = value === '*';
    else if (key === 'disallow' && appliesToUs && value) disallowed.push(value);
  }

  const allow = (path: string): boolean =>
    !disallowed.some(rule => {
      const prefix = rule.replace(/\*$/, '');
      return path.startsWith(prefix);
    });

  return { allow, sitemaps };
};
