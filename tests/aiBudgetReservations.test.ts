import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('supabase/migrations/20260824084500_ai_budget_reservations.sql', 'utf8');
const message = fs.readFileSync('supabase/functions/analyze-message/index.ts', 'utf8');
const document = fs.readFileSync('supabase/functions/analyze-document/index.ts', 'utf8');

test('budget reservation is atomic, conservative and service-role only', () => {
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /actual_spend\s*\+\s*reserved_spend\s*\+\s*reserve_usd\s*>\s*budget\.monthly_hard_limit_usd/i);
  assert.match(migration, /committed_at is not null or r\.created_at >= pg_catalog\.now\(\) - interval '5 minutes'/i);
  assert.match(migration, /revoke execute on function public\.reserve_ai_budget_call[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.reserve_ai_budget_call[\s\S]*to service_role/i);
});

test('finalization atomically converts a committed reservation into the actual cost event', () => {
  assert.match(migration, /if reservation\.committed_at is null then raise exception/i);
  assert.match(migration, /insert into public\.ai_cost_events[\s\S]*delete from public\.ai_budget_reservations/i);
  assert.match(migration, /create or replace function public\.get_ai_budget_status/i);
  assert.match(migration, /actual\.spend \+ reserved\.spend/i);
});

function assertEdgeReservationFlow(source: string, reservation: string) {
  assert.match(source, new RegExp(`${reservation.replace('.', '\\.')}\\s*=\\s*0\\.`, 'i'));
  assert.match(source, /reserve_ai_budget_call/i);
  assert.match(source, /commit_ai_budget_call/i);
  assert.match(source, /providerCallStarted\s*=\s*true[\s\S]*fetch\("https:\/\/api\.openai\.com\/v1\/responses"/i);
  assert.match(source, /finalize_ai_budget_call/i);
  assert.match(source, /conservative reservation remains/i);
  assert.doesNotMatch(source, /from\("ai_cost_events"\)\.insert/i);
}

test('message review reserves budget before OpenAI and settles provider usage', () => {
  assertEdgeReservationFlow(message, 'MESSAGE_BUDGET_RESERVATION_USD');
  assert.match(message, /MESSAGE_BUDGET_RESERVATION_USD\s*=\s*0\.02/i);
});

test('document review reserves a larger conservative budget before OpenAI', () => {
  assertEdgeReservationFlow(document, 'DOCUMENT_BUDGET_RESERVATION_USD');
  assert.match(document, /DOCUMENT_BUDGET_RESERVATION_USD\s*=\s*0\.10/i);
  // Even a pessimistic one-token-per-input-byte bound is below the reservation:
  // 250k input tokens at $0.25/M + 800 output tokens at $2/M = $0.0641.
  const pessimisticMax = (250_000 / 1_000_000) * 0.25 + (800 / 1_000_000) * 2;
  assert.ok(pessimisticMax < 0.10);
});
