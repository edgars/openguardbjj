import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVideoUrl } from './url.ts';
import { classifyByKeywords } from './classifier.ts';
import { overallProgress } from './status.ts';

test('parseVideoUrl reconhece YouTube, Shorts e Instagram', () => {
  const a = parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s');
  assert.deepEqual(a, { ok: true, platform: 'youtube', externalId: 'dQw4w9WgXcQ', normalizedUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  const b = parseVideoUrl('https://youtu.be/dQw4w9WgXcQ?si=abc');
  assert.equal(b.ok && b.externalId, 'dQw4w9WgXcQ');
  const c = parseVideoUrl('https://youtube.com/shorts/abcdefghijk');
  assert.equal(c.ok && c.platform, 'youtube_shorts');
  const d = parseVideoUrl('https://www.instagram.com/reel/C1a2B3c4D5e/?igsh=xyz');
  assert.deepEqual(d, { ok: true, platform: 'instagram', externalId: 'C1a2B3c4D5e', normalizedUrl: 'https://www.instagram.com/reel/C1a2B3c4D5e/' });
  assert.equal(parseVideoUrl('https://vimeo.com/123').ok, false);
  assert.equal(parseVideoUrl('https://www.youtube.com/playlist?list=PL1').ok, false);
  assert.equal(parseVideoUrl('não é url').ok, false);
});

test('classifyByKeywords encontra técnicas com timestamps e prefere o termo mais longo', () => {
  const hits = classifyByKeywords([
    { start: 0, end: 5, text: 'Hoje vamos trabalhar a guarda fechada.' },
    { start: 5, end: 12, text: 'Da guarda fechada eu ataco o triângulo, ajustando o ângulo.' },
    { start: 12, end: 20, text: 'Se ele defender, eu vou para a chave de braço.' },
    { start: 200, end: 210, text: 'Agora da reverse De La Riva fazemos o berimbolo.' },
  ]);
  const slugs = hits.map((h) => h.slug);
  assert.ok(slugs.includes('closed-guard'));
  assert.ok(slugs.includes('triangle-choke'));
  assert.ok(slugs.includes('armbar'));
  assert.ok(slugs.includes('reverse-de-la-riva'));
  assert.ok(!slugs.includes('de-la-riva'), 'não deve contar "de la riva" dentro de "reverse de la riva"');
  const armbar = hits.find((h) => h.slug === 'armbar')!;
  assert.equal(armbar.start, 12);
  const closed = hits.find((h) => h.slug === 'closed-guard')!;
  assert.equal(closed.mentions, 2);
});

test('classifyByKeywords ignora termo ambíguo isolado', () => {
  const hits = classifyByKeywords([{ start: 0, end: 4, text: 'Mount the camera on the tripod' }]);
  assert.equal(hits.length, 0);
});

test('overallProgress mapeia etapa para faixa global', () => {
  assert.equal(overallProgress('DOWNLOADING', 50), 25);
  assert.equal(overallProgress('COMPLETED', 0), 100);
});

test('classifyByKeywords tolera erros comuns do Whisper em nomes de guarda', () => {
  const hits = classifyByKeywords([
    { start: 0, end: 6, text: 'Put your foot in they step up now place your reverse Della here' },
    { start: 30, end: 36, text: 'The next step extend your spider over your headline' },
  ]);
  const slugs = hits.map((h) => h.slug);
  assert.ok(slugs.includes('reverse-de-la-riva'));
  assert.ok(slugs.includes('spider-guard'));
  assert.ok(!slugs.includes('de-la-riva'), 'reverse vence o termo menor');
});
