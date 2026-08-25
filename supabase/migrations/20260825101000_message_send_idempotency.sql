-- Retry-safe message creation and message-specific ciphertext binding contract.
--
-- New clients choose the logical message UUID before encryption. The same UUID is:
--   * the server logical_id;
--   * the idempotency key for network retries; and
--   * part of the AES-GCM AAD used by v2 ciphertexts.
--
-- The server cannot decrypt ciphertext, but it requires the v2 envelope marker and
-- refuses reuse of a logical UUID with different relationship/content/ciphertext/type.
-- Old authenticated send signatures are retained only as non-client legacy surfaces.

create or replace function public.send_message(
  rel_id uuid,
  message_body text,
  encrypted_body text,
  client_message_id uuid
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
  my_role text;
  rel_status text;
  msg text := trim(coalesce(message_body, ''));
  h text;
  review public.ai_message_reviews%rowtype;
  risk text := 'green';
  block_reason text;
  boundary_match text;
  plan_name text;
  trial_end timestamptz;
  premium_end timestamptz;
  premium_active boolean := false;
  rec record;
  cnt integer := 0;
  created timestamptz := now();
  existing_relationship uuid;
  existing_hash text;
  existing_ciphertext text;
  existing_kind text;
  existing_risk text;
  existing_created timestamptz;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if client_message_id is null then raise exception 'A client message identifier is required'; end if;
  if msg = '' then raise exception 'Message cannot be empty'; end if;
  if encrypted_body is null or encrypted_body = '' or char_length(encrypted_body) > 4096
     or encrypted_body not like 'v2.%' then
    raise exception 'A v2 encrypted message payload is required';
  end if;

  h := encode(extensions.digest(msg, 'sha256'), 'hex');

  -- Serialize every attempt for this sender/id pair. Hash collisions only cause harmless
  -- extra serialization; the full UUID/content checks below remain authoritative.
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || client_message_id::text, 0));

  select m.relationship_id, m.body_hash, m.ciphertext, m.message_kind, m.risk_level, m.created_at
    into existing_relationship, existing_hash, existing_ciphertext, existing_kind, existing_risk, existing_created
  from public.messages m
  where m.sender_id = uid and m.logical_id = client_message_id
  order by m.id
  limit 1;

  if found then
    if existing_relationship is distinct from rel_id
       or existing_hash is distinct from h
       or existing_ciphertext is distinct from encrypted_body
       or existing_kind is distinct from 'text' then
      raise exception 'This client message identifier was already used for different content';
    end if;
    if exists (
      select 1 from public.messages m
      where m.sender_id = uid and m.logical_id = client_message_id
        and (
          m.relationship_id is distinct from existing_relationship
          or m.body_hash is distinct from existing_hash
          or m.ciphertext is distinct from existing_ciphertext
          or m.message_kind is distinct from existing_kind
        )
    ) then
      raise exception 'Existing message rows are inconsistent';
    end if;
    select count(*)::integer into cnt
    from public.messages m
    where m.sender_id = uid and m.logical_id = client_message_id;

    return query select
      client_message_id, client_message_id, existing_relationship, uid, null::uuid,
      msg, existing_hash, existing_ciphertext, existing_risk, existing_created, existing_created,
      null::timestamptz, null::timestamptz, null::timestamptz,
      null::timestamptz, null::text, false, cnt, 0;
    return;
  end if;

  select rm.role into my_role
  from public.relationship_members rm
  where rm.relationship_id = rel_id and rm.user_id = uid;
  if my_role is null then raise exception 'Not a relationship member'; end if;
  if my_role <> 'participant' then raise exception 'Observers cannot send messages'; end if;

  select r.status into rel_status from public.relationships r where r.id = rel_id;
  if rel_status is distinct from 'active' then raise exception 'This connection is not active'; end if;

  select up.plan, up.trial_ends_at, up.premium_ends_at
    into plan_name, trial_end, premium_end
  from public.user_plans up where up.user_id = uid;
  premium_active := (plan_name = 'trial' and trial_end > now())
    or (plan_name = 'premium' and (premium_end is null or premium_end > now()));

  if premium_active then
    select r.* into review
    from public.ai_message_reviews r
    where r.user_id = uid
      and r.relationship_id = rel_id
      and r.body_hash = h
      and r.can_send = true
      and r.risk_level in ('green', 'yellow')
      and r.used_at is null
      and r.expires_at > now()
    order by r.created_at desc
    limit 1
    for update;
  end if;

  if review.id is not null then
    if char_length(msg) > 480 then raise exception 'Premium messages are limited to 480 characters'; end if;
    risk := review.risk_level;
  else
    block_reason := public.free_message_block_reason(msg);
    if block_reason is not null then raise exception '%', block_reason; end if;
  end if;

  for rec in
    select rm.user_id,
      exists(
        select 1 from public.relationship_blocks b
        where b.relationship_id = rel_id
          and b.blocker_id = rm.user_id
          and b.blocked_user_id = uid
          and (b.expires_at is null or b.expires_at > now())
      ) as is_blocked
    from public.relationship_members rm
    where rm.relationship_id = rel_id and rm.user_id <> uid
  loop
    if not rec.is_blocked then
      boundary_match := private.matching_personal_boundary(rec.user_id, rel_id, msg);
      if boundary_match is not null then
        raise exception 'Message matches a recipient''s private Personal Boundary';
      end if;
    end if;

    insert into public.messages(
      logical_id, relationship_id, sender_id, recipient_id,
      body, body_hash, ciphertext, risk_level, blocked_for_recipient,
      created_at, available_at, message_kind
    ) values (
      client_message_id, rel_id, uid, rec.user_id,
      msg, h, encrypted_body, risk, rec.is_blocked,
      created, public.next_message_available_at(rec.user_id, created), 'text'
    );
    cnt := cnt + 1;
  end loop;

  if cnt = 0 then raise exception 'The other person has not joined yet'; end if;
  if review.id is not null then
    update public.ai_message_reviews set used_at = now() where ai_message_reviews.id = review.id;
  end if;

  return query select
    client_message_id, client_message_id, rel_id, uid, null::uuid,
    msg, h, encrypted_body, risk, created, created,
    null::timestamptz, null::timestamptz, null::timestamptz,
    null::timestamptz, null::text, false, cnt, 0;
end;
$$;

create or replace function public.send_text_attachment(
  rel_id uuid,
  attachment_text text,
  encrypted_body text,
  file_name text,
  mime_type text,
  size_bytes integer,
  page_count integer,
  client_message_id uuid
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
  raw_name text := btrim(coalesce(file_name, ''));
  clean_name text;
  extension text;
  requested_mime_type text := $5;
  requested_size_bytes integer := $6;
  requested_page_count integer := $7;
  my_role text;
  rel_status text;
  plan_name text;
  trial_end timestamptz;
  premium_end timestamptz;
  h text;
  review public.ai_document_reviews%rowtype;
  risk text;
  computed_pages integer;
  boundary_match text;
  rec record;
  cnt integer := 0;
  created timestamptz := now();
  existing_relationship uuid;
  existing_hash text;
  existing_ciphertext text;
  existing_kind text;
  existing_risk text;
  existing_created timestamptz;
  existing_name text;
  existing_mime text;
  existing_size integer;
  existing_pages integer;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if client_message_id is null then raise exception 'A client message identifier is required'; end if;
  if doc = '' then raise exception 'The document contains no readable text'; end if;
  if char_length(doc) > 60000 or octet_length(doc) > 250000 then
    raise exception 'Document text is longer than the 20-page limit';
  end if;
  if encrypted_body is null or encrypted_body = '' or char_length(encrypted_body) > 400000
     or encrypted_body not like 'v2.%' then
    raise exception 'A v2 encrypted document payload is required';
  end if;

  if raw_name ~ (
    '[' || chr(173) || chr(847) || chr(1564) ||
    chr(6155) || '-' || chr(6158) ||
    chr(8203) || '-' || chr(8207) ||
    chr(8234) || '-' || chr(8238) ||
    chr(8288) || '-' || chr(8303) ||
    chr(65024) || '-' || chr(65039) || chr(65279) ||
    chr(917504) || '-' || chr(917631) ||
    chr(917760) || '-' || chr(917999) || ']'
  ) then
    raise exception 'The document file name contains unsupported invisible formatting characters';
  end if;

  clean_name := normalize(raw_name, NFKC);
  if clean_name = '' or char_length(clean_name) > 120 or clean_name ~ '[\\/[:cntrl:]]' then
    raise exception 'The document needs a valid file name';
  end if;
  extension := lower(substring(clean_name from '\.([^.]+)$'));
  if extension not in ('txt', 'md', 'markdown', 'csv') then
    raise exception 'Unsupported document file extension';
  end if;
  if requested_mime_type not in ('text/plain', 'text/markdown', 'text/csv') then
    raise exception 'Unsupported document type';
  end if;
  if (extension = 'txt' and requested_mime_type <> 'text/plain')
     or (extension in ('md', 'markdown') and requested_mime_type <> 'text/markdown')
     or (extension = 'csv' and requested_mime_type <> 'text/csv') then
    raise exception 'Document file extension and type do not match';
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

  h := encode(extensions.digest(doc, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || client_message_id::text, 0));

  select m.relationship_id, m.body_hash, m.ciphertext, m.message_kind, m.risk_level, m.created_at,
         m.attachment_name, m.attachment_mime_type, m.attachment_size_bytes, m.attachment_page_count
    into existing_relationship, existing_hash, existing_ciphertext, existing_kind, existing_risk, existing_created,
         existing_name, existing_mime, existing_size, existing_pages
  from public.messages m
  where m.sender_id = uid and m.logical_id = client_message_id
  order by m.id
  limit 1;

  if found then
    if existing_relationship is distinct from rel_id
       or existing_hash is distinct from h
       or existing_ciphertext is distinct from encrypted_body
       or existing_kind is distinct from 'text_attachment'
       or existing_name is distinct from clean_name
       or existing_mime is distinct from requested_mime_type
       or existing_size is distinct from requested_size_bytes
       or existing_pages is distinct from requested_page_count then
      raise exception 'This client message identifier was already used for different content';
    end if;
    if exists (
      select 1 from public.messages m
      where m.sender_id = uid and m.logical_id = client_message_id
        and (
          m.relationship_id is distinct from existing_relationship
          or m.body_hash is distinct from existing_hash
          or m.ciphertext is distinct from existing_ciphertext
          or m.message_kind is distinct from existing_kind
          or m.attachment_name is distinct from existing_name
          or m.attachment_mime_type is distinct from existing_mime
          or m.attachment_size_bytes is distinct from existing_size
          or m.attachment_page_count is distinct from existing_pages
        )
    ) then
      raise exception 'Existing message rows are inconsistent';
    end if;
    select count(*)::integer into cnt
    from public.messages m
    where m.sender_id = uid and m.logical_id = client_message_id;

    return query select
      client_message_id, client_message_id, existing_relationship, uid, null::uuid,
      doc, existing_hash, existing_ciphertext, existing_risk, existing_created, existing_created,
      null::timestamptz, null::timestamptz, null::timestamptz,
      null::timestamptz, null::text, false, cnt, 0;
    return;
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
          and (b.expires_at is null or b.expires_at > now())
      ) as is_blocked
    from public.relationship_members rm
    where rm.relationship_id = rel_id and rm.user_id <> uid
  loop
    if not rec.is_blocked then
      boundary_match := private.matching_personal_boundary(rec.user_id, rel_id, doc);
      if boundary_match is not null then
        raise exception 'The document matches a recipient''s private Personal Boundary';
      end if;
    end if;

    insert into public.messages(
      logical_id, relationship_id, sender_id, recipient_id,
      body, body_hash, ciphertext, risk_level, blocked_for_recipient,
      created_at, available_at, message_kind, attachment_name,
      attachment_mime_type, attachment_size_bytes, attachment_page_count
    ) values (
      client_message_id, rel_id, uid, rec.user_id,
      doc, h, encrypted_body, risk, rec.is_blocked,
      created, public.next_message_available_at(rec.user_id, created),
      'text_attachment', clean_name, requested_mime_type, requested_size_bytes, requested_page_count
    );
    cnt := cnt + 1;
  end loop;

  if cnt = 0 then raise exception 'The other person has not joined yet'; end if;
  update public.ai_document_reviews set used_at = now() where ai_document_reviews.id = review.id;

  return query select
    client_message_id, client_message_id, rel_id, uid, null::uuid,
    doc, h, encrypted_body, risk, created, created,
    null::timestamptz, null::timestamptz, null::timestamptz,
    null::timestamptz, null::text, false, cnt, 0;
end;
$$;

-- New client contract.
revoke execute on function public.send_message(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.send_text_attachment(uuid, text, text, text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.send_message(uuid, text, text, uuid) from public, anon;
revoke execute on function public.send_text_attachment(uuid, text, text, text, text, integer, integer, uuid) from public, anon;
grant execute on function public.send_message(uuid, text, text, uuid) to authenticated, service_role;
grant execute on function public.send_text_attachment(uuid, text, text, text, text, integer, integer, uuid) to authenticated, service_role;
