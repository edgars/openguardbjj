/** Normalização de nomes de pessoas para comparação e slugs ("Tainan Dal Prá" → "tainan dal pra"). */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const nameSlug = (s: string) => normalizeName(s).replace(/\s+/g, '-').slice(0, 80);

/**
 * true se dois nomes provavelmente são a mesma pessoa: iguais sem espaços ("dalpra" = "dal pra"),
 * ou todos os tokens do mais curto (≥ 2 tokens) aparecem no mais longo ("tainan dalpra" ⊂ "tainan dalpra costa").
 */
export function sameName(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na.replace(/ /g, '') === nb.replace(/ /g, '')) return true;
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  const st = short.split(' ');
  const lt = new Set(long.split(' '));
  if (st.length < 2) return false;
  const longJoined = long.replace(/ /g, '');
  return st.every((t) => lt.has(t) || longJoined.includes(t));
}
