import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const check = fs.readFileSync('supabase/checks/security_definer_schema.sql', 'utf8');

test('post-deploy security gate rejects privacy-sensitive authenticated RPC surfaces', () => {
  for (const signature of [
    'public.withdraw_message(uuid)',
    'public.edit_unopened_message(uuid,text,text)',
    'public.get_relationship_partner_settings(uuid)',
    'public.get_member_write_upgrade_offer(uuid)',
    'public.get_member_upgrade_verification_context(uuid,uuid)',
    'public.confirm_verified_member_write_upgrade(uuid,uuid,text,text,text,timestamptz,timestamptz)',
    'public.confirm_member_write_upgrade(uuid,uuid,text)',
    'public.complete_billing_intent(uuid,text,text,timestamptz,timestamptz)',
  ]) {
    assert.match(check, new RegExp(signature.replace(/[().]/g, '\\$&')));
  }
  assert.match(check, /has_function_privilege\('authenticated', target, 'execute'\)/i);
  assert.match(check, /has_function_privilege\('anon', target, 'execute'\)/i);
  assert.match(check, /Privacy-sensitive or service-only RPC must not be executable/i);
});

test('post-deploy gate rejects the obsolete three-argument block RPC', () => {
  assert.match(check, /to_regprocedure\('public\.set_member_block\(uuid,uuid,boolean\)'\)/i);
  assert.match(check, /Legacy three-argument set_member_block RPC must not survive/i);
});
