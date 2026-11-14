// Test för åldersberäkningen. Kör: npm test (i mappen app)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beräknaÅlder } from './profil.js';

const dag = (å, m, d) => new Date(å, m - 1, d);

test('barn', () => {
  assert.deepEqual(beräknaÅlder({ typ: 'barn', datum: '2026-01-31' }, dag(2026, 2, 28)), { typ: 'barn', månader: 0, veckor: 4 });
  assert.deepEqual(beräknaÅlder({ typ: 'barn', datum: '2026-01-31' }, dag(2026, 3, 1)), { typ: 'barn', månader: 1 });
  assert.deepEqual(beräknaÅlder({ typ: 'barn', datum: '2025-05-15' }, dag(2026, 11, 3)), { typ: 'barn', månader: 17 });
  assert.deepEqual(beräknaÅlder({ typ: 'barn', datum: '2026-11-03' }, dag(2026, 11, 3)), { typ: 'barn', månader: 0, veckor: 0 });
});

test('gravid', () => {
  // 280 dagar kvar = vecka 0+0, 0 dagar kvar = 40+0, långt efter BF stannar på 300 dagar = 42+6
  assert.deepEqual(beräknaÅlder({ typ: 'gravid', datum: '2027-08-10' }, dag(2026, 11, 3)), { typ: 'gravid', vecka: 0, dag: 0 });
  assert.deepEqual(beräknaÅlder({ typ: 'gravid', datum: '2026-11-03' }, dag(2026, 11, 3)), { typ: 'gravid', vecka: 40, dag: 0 });
  assert.deepEqual(beräknaÅlder({ typ: 'gravid', datum: '2026-01-01' }, dag(2026, 11, 3)), { typ: 'gravid', vecka: 42, dag: 6 });
});

test('ammar och trasig profil', () => {
  assert.deepEqual(beräknaÅlder({ typ: 'ammar' }), { typ: 'ammar' });
  assert.deepEqual(beräknaÅlder({ typ: 'ammar', datum: '2026-07-03' }, dag(2026, 11, 3)), { typ: 'ammar', månader: 4 });
  assert.equal(beräknaÅlder({ typ: 'barn' }), null);
  assert.equal(beräknaÅlder(null), null);
});
