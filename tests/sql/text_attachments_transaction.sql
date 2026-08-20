-- Run after the Personal Boundaries and text attachment migrations, inside a transaction that is rolled back.

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'attachment-sender@example.invalid', '', now(), now(), now()),
('10000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'attachment-recipient@example.invalid', '', now(), now(), now());

insert into public.profiles(id, display_name) values
('10000000-0000-4000-8000-000000000001', 'Sender'),
('10000000-0000-4000-8000-000000000002', 'Recipient')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.user_plans(user_id, plan, premium_ends_at) values
('10000000-0000-4000-8000-000000000001', 'premium', now() + interval '30 days'),
('10000000-0000-4000-8000-000000000002', 'premium', now() + interval '30 days')
on conflict (user_id) do update set plan = excluded.plan, premium_ends_at = excluded.premium_ends_at;

insert into public.relationships(id, created_by, status)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'active');
insert into public.relationship_members(relationship_id, user_id, role) values
('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'participant'),
('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'participant');

insert into public.ai_document_reviews(user_id, relationship_id, body_hash, file_name, mime_type, size_bytes, page_count, risk_level, can_send)
values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
encode(extensions.digest('Pickup Friday', 'sha256'), 'hex'), 'schedule.txt', 'text/plain', 13, 1, 'green', true);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
set local role authenticated;

do $test$
declare sent record; sender_meta record;
begin
  select * into sent from public.send_text_attachment(
    '20000000-0000-4000-8000-000000000001', 'Pickup Friday', 'cipher',
    'schedule.txt', 'text/plain', 13, 1
  );
  if sent.recipient_count <> 1 or sent.body_hash <> encode(extensions.digest('Pickup Friday', 'sha256'), 'hex') then
    raise exception 'approved send did not preserve expected routing and hash';
  end if;
  select * into sender_meta from public.list_relationship_attachment_metadata('20000000-0000-4000-8000-000000000001') limit 1;
  if sender_meta.attachment_name <> 'schedule.txt' then raise exception 'sender metadata missing'; end if;
  begin
    perform public.send_text_attachment(
      '20000000-0000-4000-8000-000000000001', 'Pickup Friday', 'cipher',
      'schedule.txt', 'text/plain', 13, 1
    );
    raise exception 'review replay unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%current approved review%' then raise; end if;
  end;

  begin
    perform public.edit_unopened_message(sent.logical_id, 'Changed', 'changed-cipher');
    raise exception 'document edit unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%cannot be edited%' then raise; end if;
  end;
end
$test$;

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
set local role authenticated;

do $test$
declare incoming_id uuid; unopened_name text; opened_name text;
begin
  select id into incoming_id
  from public.list_relationship_messages('20000000-0000-4000-8000-000000000001')
  where sender_id <> auth.uid()
  limit 1;
  select attachment_name into unopened_name
  from public.list_relationship_attachment_metadata('20000000-0000-4000-8000-000000000001')
  where message_key = incoming_id;
  if unopened_name is not null then raise exception 'unopened filename leaked'; end if;
  perform public.open_message(incoming_id);
  select attachment_name into opened_name
  from public.list_relationship_attachment_metadata('20000000-0000-4000-8000-000000000001')
  where message_key = incoming_id;
  if opened_name <> 'schedule.txt' then raise exception 'opened filename missing'; end if;
end
$test$;

reset role;
insert into public.personal_boundaries(user_id, relationship_id, word, normalized_phrase)
values ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'late again', 'late again');
insert into public.ai_document_reviews(user_id, relationship_id, body_hash, file_name, mime_type, size_bytes, page_count, risk_level, can_send)
values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
encode(extensions.digest('The schedule says late, again.', 'sha256'), 'hex'), 'blocked.md', 'text/markdown', 30, 1, 'green', true);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
set local role authenticated;
do $test$
begin
  begin
    perform public.send_text_attachment(
      '20000000-0000-4000-8000-000000000001', 'The schedule says late, again.', 'cipher',
      'blocked.md', 'text/markdown', 30, 1
    );
    raise exception 'personal boundary unexpectedly bypassed';
  exception when others then
    if sqlerrm not like '%blocked word or phrase: "late again"%' then raise; end if;
  end;

  begin
    perform public.send_text_attachment(
      '20000000-0000-4000-8000-000000000001', 'x', 'cipher',
      'blocked.md', 'text/markdown', 30, 2
    );
    raise exception 'page mismatch unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%page count does not match%' then raise; end if;
  end;
end
$test$;

reset role;
update public.user_plans set plan = 'free', premium_ends_at = null
where user_id = '10000000-0000-4000-8000-000000000001';
insert into public.ai_document_reviews(user_id, relationship_id, body_hash, file_name, mime_type, size_bytes, page_count, risk_level, can_send)
values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
encode(extensions.digest('Free text', 'sha256'), 'hex'), 'free.txt', 'text/plain', 9, 1, 'green', true);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
set local role authenticated;
do $test$
begin
  begin
    perform public.send_text_attachment(
      '20000000-0000-4000-8000-000000000001', 'Free text', 'cipher',
      'free.txt', 'text/plain', 9, 1
    );
    raise exception 'free attachment unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%Premium is required%' then raise; end if;
  end;
end
$test$;
reset role;

select 'attachment migration behavior passed' as result;
