import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('supabase/migrations/20260820173500_text_document_attachments.sql', 'utf8');

test('document review approvals are short-lived, one-use and service-owned', () => {
  assert.match(migration, /create table if not exists public\.ai_document_reviews/i);
  assert.match(migration, /expires_at timestamptz not null default \(now\(\) \+ interval '15 minutes'\)/i);
  assert.match(migration, /r\.used_at is null[\s\S]*r\.expires_at > now\(\)[\s\S]*for update/i);
  assert.match(migration, /update public\.ai_document_reviews set used_at = now\(\)/i);
  assert.match(migration, /revoke all on table public\.ai_document_reviews from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert, update, delete on table public\.ai_document_reviews to service_role/i);
});

test('send RPC binds the approval to the full text and exact file metadata', () => {
  assert.match(migration, /h := encode\(extensions\.digest\(doc, 'sha256'\), 'hex'\)/i);
  for (const field of ['body_hash = h', 'file_name = clean_name', 'mime_type = requested_mime_type', 'size_bytes = requested_size_bytes', 'page_count = requested_page_count']) {
    assert.match(migration, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
  assert.match(migration, /char_length\(doc\) > 60000[\s\S]*octet_length\(doc\) > 250000/i);
  assert.match(migration, /ceil\(char_length\(doc\)::numeric \/ 3000\)/i);
  assert.match(migration, /attachment_size_bytes between 1 and 5242880/i);
});

test('recipient boundaries and attachment privacy are enforced server-side', () => {
  assert.match(migration, /private\.matching_personal_boundary\(rec\.user_id, rel_id, doc\)/i);
  assert.match(migration, /case when m\.blocked_for_recipient or m\.opened_at is null then null else m\.attachment_name end/i);
  assert.match(migration, /m\.recipient_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /raise exception 'Document attachments cannot be edited'/i);
  assert.match(migration, /before update of edited_at on public\.messages/i);
});

test('attachment RPCs use fixed search paths and explicit grants', () => {
  for (const fn of ['list_relationship_attachment_metadata', 'send_text_attachment']) {
    assert.match(migration, new RegExp(`function public\\.${fn}[\\s\\S]*?security definer\\s+set search_path = ''`, 'i'));
  }
  assert.match(migration, /revoke execute on function private\.prevent_text_attachment_edit\(\) from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.send_text_attachment[\s\S]*to authenticated, service_role/i);
});
