-- Premium plain-text document attachments with server-owned review approvals.

alter table public.messages
  add column if not exists message_kind text not null default 'text',
  add column if not exists attachment_name text,
  add column if not exists attachment_mime_type text,
  add column if not exists attachment_size_bytes integer,
  add column if not exists attachment_page_count integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'messages_message_kind_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages add constraint messages_message_kind_check
      check (message_kind in ('text', 'text_attachment'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'messages_attachment_shape_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages add constraint messages_attachment_shape_check
      check (
        (message_kind = 'text'
          and attachment_name is null
          and attachment_mime_type is null
          and attachment_size_bytes is null
          and attachment_page_count is null)
        or
        (message_kind = 'text_attachment'
          and attachment_name is not null
          and char_length(attachment_name) between 1 and 120
          and attachment_mime_type in ('text/plain', 'text/markdown', 'text/csv')
          and attachment_size_bytes between 1 and 5242880
          and attachment_page_count between 1 and 20)
      );
  end if;
end
$$;

create table if not exists public.ai_document_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  relationship_id uuid not null references public.relationships(id) on delete cascade,
  body_hash text not null check (body_hash ~ '^[0-9a-f]{64}$'),
  file_name text not null check (char_length(file_name) between 1 and 120),
  mime_type text not null check (mime_type in ('text/plain', 'text/markdown', 'text/csv')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  page_count integer not null check (page_count between 1 and 20),
  risk_level text not null check (risk_level in ('green', 'yellow', 'red')),
  can_send boolean not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  used_at timestamptz,
  check (not can_send or risk_level in ('green', 'yellow'))
);

alter table public.ai_document_reviews enable row level security;
revoke all on table public.ai_document_reviews from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_document_reviews to service_role;

create index if not exists ai_document_reviews_send_lookup
  on public.ai_document_reviews(user_id, relationship_id, body_hash, expires_at desc)
  where used_at is null and can_send;

create or replace function private.prevent_text_attachment_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.message_kind = 'text_attachment'
    and new.edited_at is distinct from old.edited_at then
    raise exception 'Document attachments cannot be edited';
  end if;
  return new;
end
$$;

drop trigger if exists prevent_text_attachment_edit on public.messages;
create trigger prevent_text_attachment_edit
before update of edited_at on public.messages
for each row
execute function private.prevent_text_attachment_edit();

create or replace function public.list_relationship_attachment_metadata(rel_id uuid)
returns table(
  message_key uuid,
  message_kind text,
  attachment_name text,
  attachment_mime_type text,
  attachment_size_bytes integer,
  attachment_page_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.logical_id, 'text_attachment'::text,
    max(m.attachment_name), max(m.attachment_mime_type),
    max(m.attachment_size_bytes), max(m.attachment_page_count)
  from public.messages m
  where m.relationship_id = rel_id
    and m.sender_id = (select auth.uid())
    and m.message_kind = 'text_attachment'
  group by m.logical_id
  union all
  select m.id, 'text_attachment'::text,
    case when m.blocked_for_recipient or m.opened_at is null then null else m.attachment_name end,
    case when m.blocked_for_recipient or m.opened_at is null then null else m.attachment_mime_type end,
    case when m.blocked_for_recipient or m.opened_at is null then null else m.attachment_size_bytes end,
    case when m.blocked_for_recipient or m.opened_at is null then null else m.attachment_page_count end
  from public.messages m
  where m.relationship_id = rel_id
    and m.recipient_id = (select auth.uid())
    and m.message_kind = 'text_attachment'
    and m.available_at <= now()
    and m.withdrawn_at is null
    and m.rejected_at is null;
$$;

create or replace function public.send_text_attachment(
  rel_id uuid,
  attachment_text text,
  encrypted_body text,
  file_name text,
  mime_type text,
  size_bytes integer,
  page_count integer
)
returns table(
  id uuid,
  logical_id uuid,
  relationship_id uuid,
  sender_id uuid,
  recipient_id uuid,
  body text,
  body_hash text,
  ciphertext text,
  risk_level text,
  created_at timestamptz,
  available_at timestamptz,
  opened_at timestamptz,
  withdrawn_at timestamptz,
  edited_at timestamptz,
  rejected_at timestamptz,
  reject_reason text,
  blocked_for_recipient boolean,
  recipient_count integer,
  rejected_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  doc text := trim(coalesce(attachment_text, ''));
  clean_name text := btrim(coalesce(file_name, ''));
  requested_mime_type text := $5;
  requested_size_bytes integer := $6;
  requested_page_count integer := $7;
  my_role text;
  rel_status text;
  plan_name text;
  trial_end timestamptz;
  premium_end timestamptz;
  h text;
  logical uuid := gen_random_uuid();
  review public.ai_document_reviews%rowtype;
  risk text;
  computed_pages integer;
  boundary_phrase text;
  rec record;
  cnt integer := 0;
  created timestamptz := now();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if doc = '' then raise exception 'The document contains no readable text'; end if;
  if char_length(doc) > 60000 or octet_length(doc) > 250000 then
    raise exception 'Document text is longer than the 20-page limit';
  end if;
  if encrypted_body is null or encrypted_body = '' or char_length(encrypted_body) > 400000 then
    raise exception 'Encrypted document payload is required';
  end if;
  if clean_name = '' or char_length(clean_name) > 120
    or clean_name ~ '[\\/[:cntrl:]]' then
    raise exception 'The document needs a valid file name';
  end if;
  if requested_mime_type not in ('text/plain', 'text/markdown', 'text/csv') then
    raise exception 'Unsupported document type';
  end if;
  if requested_size_bytes is null or requested_size_bytes < 1 or requested_size_bytes > 5242880 then
    raise exception 'Documents must be between 1 byte and 5 MB';
  end if;
  computed_pages := greatest(
    1,
    ceil(char_length(doc)::numeric / 3000)::integer,
    1 + char_length(doc) - char_length(replace(doc, chr(12), ''))
  );
  if requested_page_count is distinct from computed_pages or requested_page_count > 20 then
    raise exception 'Document page count does not match the reviewed text';
  end if;

  select rm.role into my_role
  from public.relationship_members rm
  where rm.relationship_id = rel_id and rm.user_id = uid;
  if my_role is null then raise exception 'Not a relationship member'; end if;
  if my_role <> 'participant' then raise exception 'Observers cannot send documents'; end if;
  select r.status into rel_status from public.relationships r where r.id = rel_id;
  if rel_status is distinct from 'active' then raise exception 'This connection is not active'; end if;

  select up.plan, up.trial_ends_at, up.premium_ends_at
    into plan_name, trial_end, premium_end
  from public.user_plans up where up.user_id = uid;
  if not (
    (plan_name = 'trial' and trial_end > now())
    or (plan_name = 'premium' and (premium_end is null or premium_end > now()))
  ) then
    raise exception 'Premium is required for document attachments';
  end if;

  h := encode(extensions.digest(doc, 'sha256'), 'hex');
  select r.* into review
  from public.ai_document_reviews r
  where r.user_id = uid
    and r.relationship_id = rel_id
    and r.body_hash = h
    and r.file_name = clean_name
    and r.mime_type = requested_mime_type
    and r.size_bytes = requested_size_bytes
    and r.page_count = requested_page_count
    and r.can_send = true
    and r.risk_level in ('green', 'yellow')
    and r.used_at is null
    and r.expires_at > now()
  order by r.created_at desc
  limit 1
  for update;
  if review.id is null then raise exception 'The complete document needs a current approved review'; end if;
  risk := review.risk_level;

  for rec in
    select rm.user_id,
      exists(
        select 1 from public.relationship_blocks b
        where b.relationship_id = rel_id
          and b.blocker_id = rm.user_id
          and b.blocked_user_id = uid
      ) as is_blocked
    from public.relationship_members rm
    where rm.relationship_id = rel_id and rm.user_id <> uid
  loop
    if not rec.is_blocked then
      boundary_phrase := private.matching_personal_boundary(rec.user_id, rel_id, doc);
      if boundary_phrase is not null then
        raise exception 'The document contains the recipient''s blocked word or phrase: "%"', boundary_phrase;
      end if;
    end if;
    insert into public.messages(
      logical_id, relationship_id, sender_id, recipient_id,
      body, body_hash, ciphertext, risk_level, blocked_for_recipient,
      created_at, available_at, message_kind, attachment_name,
      attachment_mime_type, attachment_size_bytes, attachment_page_count
    ) values (
      logical, rel_id, uid, rec.user_id,
      doc, h, encrypted_body, risk, rec.is_blocked,
      created, public.next_message_available_at(rec.user_id, created),
      'text_attachment', clean_name, requested_mime_type, requested_size_bytes, requested_page_count
    );
    cnt := cnt + 1;
  end loop;
  if cnt = 0 then raise exception 'The other person has not joined yet'; end if;
  update public.ai_document_reviews set used_at = now() where ai_document_reviews.id = review.id;

  return query select
    logical, logical, rel_id, uid, null::uuid,
    doc, h, encrypted_body, risk, created, created,
    null::timestamptz, null::timestamptz, null::timestamptz,
    null::timestamptz, null::text, false, cnt, 0;
end
$$;

revoke execute on function public.list_relationship_attachment_metadata(uuid) from public, anon;
revoke execute on function public.send_text_attachment(uuid, text, text, text, text, integer, integer) from public, anon;
revoke execute on function private.prevent_text_attachment_edit() from public, anon, authenticated, service_role;
grant execute on function public.list_relationship_attachment_metadata(uuid) to authenticated, service_role;
grant execute on function public.send_text_attachment(uuid, text, text, text, text, integer, integer) to authenticated, service_role;
