export const canonicalUrl = (raw: string, base?: string): string | undefined => {
  let u: URL;
  try {
    u = new URL(raw, base);
  } catch {
    return undefined;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
  const path = decodeURI(u.pathname).replace(/\/+$/, '');
  return `${u.protocol}//${u.hostname.toLowerCase()}${path}`;
};
