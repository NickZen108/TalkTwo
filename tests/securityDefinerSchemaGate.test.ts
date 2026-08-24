import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const check = fs.readFileSync('supabase/checks/security_definer_schema.sql', 'utf8');

test('post-deploy gate audits only authenticated SECURITY DEFINER entry points', () => {
  assert.match(check, /p\.prosecdef/i);
  assert.match(check, /has_function_privilege\('authenticated', p\.oid, 'execute'\)/i);
});

test('post-deploy gate requires caller binding, fixed search path and narrow grants', () => {
  assert.match(check, /pg_get_functiondef\(p\.oid\) !~\* 'auth\\\.uid/i);
  assert.match(check, /\^search_path=/i);
  assert.match(check, /has_function_privilege\('anon', p\.oid, 'execute'\)/i);
  assert.match(check, /has_function_privilege\('public', p\.oid, 'execute'\)/i);
  assert.match(check, /has_schema_privilege\('authenticated', 'public', 'create'\)/i);
  assert.match(check, /has_schema_privilege\('anon', 'public', 'create'\)/i);
  assert.match(check, /security_definer_schema_ok/i);
});
