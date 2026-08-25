import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('supabase/migrations/20260824115000_premium_gift_product_lock.sql', 'utf8');
const billing = fs.readFileSync('src/services/billing.ts', 'utf8');
const catalog = fs.readFileSync('src/domain/storeProducts.ts', 'utf8');

test('server checkout supports only the one-month 59 DKK Premium gift', () => {
  assert.match(migration, /months is distinct from 1::smallint/i);
  assert.match(migration, /duration_months[\s\S]*5900[\s\S]*false/i);
  assert.match(migration, /return query select new_id, 5900, 'dkk'::text, false/i);
});

test('mobile checkout cannot request a multi-month gift', () => {
  assert.match(billing, /if \(months !== 1\) throw new Error\('TalkTwo Premium gifts are one month only\.'/i);
  assert.match(billing, /months: 1/i);
});

test('store catalog still contains the one-month gift product at 59 DKK', () => {
  assert.match(catalog, /premium_gift_1m/i);
  assert.match(catalog, /priceDkk:\s*59/i);
});
