-- Adversarial Unicode hardening for text-policy decisions.
--
-- User-visible message text is not rewritten by this migration. Policy matching sees
-- an NFKC compatibility-normalized copy with default-ignorable formatting controls,
-- bidi controls, variation selectors and Unicode tag characters removed. This closes
-- bypasses such as a<ZWSP>lways, f<ZWSP>uck, sch<ZWSP>ool and full-width punctuation.
-- Emoji checks deliberately inspect the original text before policy canonicalization.
--
-- Keep the canonicalization expression local to the existing functions instead of
-- adding a new client-callable RPC surface.

create or replace function public.normalize_personal_boundary(value text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  policy text := normalize(trim(coalesce(value, '')), NFKC);
begin
  policy := regexp_replace(
    policy,
    '[' ||
      chr(173) || chr(847) || chr(1564) ||
      chr(6155) || '-' || chr(6158) ||
      chr(8203) || '-' || chr(8207) ||
      chr(8234) || '-' || chr(8238) ||
      chr(8288) || '-' || chr(8303) ||
      chr(65024) || '-' || chr(65039) || chr(65279) ||
      chr(917504) || '-' || chr(917631) ||
      chr(917760) || '-' || chr(917999) ||
    ']',
    '',
    'g'
  );

  return trim(regexp_replace(
    lower(regexp_replace(policy, '[^[:alnum:]]+', ' ', 'g')),
    '[[:space:]]+', ' ', 'g'
  ));
end;
$$;

-- The stronger normalization may collapse an intentionally obfuscated existing
-- boundary to an essential logistics word. Such a row must be removed, not silently
-- upgraded into a hidden block on school/medicine/etc. Drop the unique index while
-- re-normalizing so compatibility-equivalent duplicates can be resolved deterministically.
drop index if exists public.personal_boundaries_user_relationship_normalized_idx;

delete from public.personal_boundaries pb
where public.normalize_personal_boundary(pb.word) = any(array[
  'address', 'adresse', 'aflevering', 'akut', 'barn', 'børn', 'child', 'children',
  'doctor', 'dropoff', 'emergency', 'hospital', 'læge', 'medication', 'medicine',
  'medicin', 'nødsituation', 'phone', 'pickup', 'school', 'skole', 'telefon', 'urgent'
]::text[]);

update public.personal_boundaries pb
set normalized_phrase = public.normalize_personal_boundary(pb.word)
where pb.normalized_phrase is distinct from public.normalize_personal_boundary(pb.word);

with duplicates as (
  select id,
         row_number() over (
           partition by user_id, relationship_id, normalized_phrase
           order by created_at, id
         ) as duplicate_number
  from public.personal_boundaries
)
delete from public.personal_boundaries pb
using duplicates d
where pb.id = d.id and d.duplicate_number > 1;

create unique index personal_boundaries_user_relationship_normalized_idx
  on public.personal_boundaries(user_id, relationship_id, normalized_phrase);

create or replace function public.free_message_block_reason(message_body text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  clean text := trim(coalesce(message_body, ''));
  policy text;
  m text;
  letters text;
  upper_letters text;
begin
  if char_length(clean) = 0 then return 'Message cannot be empty'; end if;
  if char_length(clean) > 160 then return 'Free messages are limited to 160 characters'; end if;

  policy := normalize(clean, NFKC);
  policy := regexp_replace(
    policy,
    '[' ||
      chr(173) || chr(847) || chr(1564) ||
      chr(6155) || '-' || chr(6158) ||
      chr(8203) || '-' || chr(8207) ||
      chr(8234) || '-' || chr(8238) ||
      chr(8288) || '-' || chr(8303) ||
      chr(65024) || '-' || chr(65039) || chr(65279) ||
      chr(917504) || '-' || chr(917631) ||
      chr(917760) || '-' || chr(917999) ||
    ']',
    '',
    'g'
  );
  m := lower(policy);

  if position('!' in policy) > 0 then return 'Exclamation marks are not allowed in Free messages'; end if;

  -- Inspect the original text first so removing variation selectors cannot hide emoji.
  if clean ~ '[😀-🙏🌀-🫿☀-➿]' or clean ~ '[🇦-🇿]'
     or position(chr(65039) in clean) > 0 or position(chr(8419) in clean) > 0 then
    return 'Emoji or emoticons are not allowed in Free messages';
  end if;
  if policy ~ '([:;=8xX][-^'']?[()DPp]|<3)' then return 'Emoji or emoticons are not allowed in Free messages'; end if;

  if m ~ '(^|[^[:alpha:]])(fuck(ing|ed|er)?|motherfucker|shit|bullshit|bitch|asshole|cunt|dickhead|idiot|moron|fuck[[:space:]]+dig|røvhul|kælling|fandme|hold[[:space:]]+kæft|lort)([^[:alpha:]]|$)' then
    return 'Profanity is not allowed';
  end if;

  if m ~ '(^|[^[:alpha:]])(always|never|constantly|altid|aldrig|konstant)([^[:alpha:]]|$)'
     or m ~ '(^|[^[:alpha:]])every[[:space:]]+time([^[:alpha:]]|$)'
     or m ~ '(^|[^[:alpha:]])hver[[:space:]]+gang([^[:alpha:]]|$)' then
    return 'Generalisations such as always or never are not allowed';
  end if;

  if m ~ '((late|forgot|failed|missed|wrong).{0,20}again|again.{0,20}(late|forgot|failed|missed|wrong)|(for sent|forsinket|glemte|glemt|svigtede|forkert).{0,20}igen|igen.{0,20}(for sent|forsinket|glemte|glemt|svigtede|forkert))' then
    return 'Unnecessary reminders of past faults are not allowed';
  end if;

  if m ~ '(why can''t you|why can’t you|why do you always|det er ikke okay at du|jeg synes ikke det er okay at du|hvorfor kan du ikke|hvorfor gør du altid)' then
    return 'Criticism or blame is not allowed';
  end if;
  if m ~ '(you (are|were).{0,40}(late|wrong|selfish|irresponsible|rude|unreasonable|lazy|careless)|du (er|var|kom).{0,40}(forsinket|for sent|forkert|egoistisk|uansvarlig|uhøflig|urimelig|doven|ligeglad))' then
    return 'Criticism or blame is not allowed';
  end if;

  if m ~ '(i feel|you make me feel|i am hurt|i''m hurt|jeg føler|jeg bliver ked af|du gør mig|jeg er såret)' then
    return 'Emotional processing is not allowed in TalkTwo messages';
  end if;

  letters := regexp_replace(policy, '[^A-Za-zÆØÅÄÖÜæøåäöü]', '', 'g');
  if char_length(letters) >= 8 then
    upper_letters := regexp_replace(letters, '[^A-ZÆØÅÄÖÜ]', '', 'g');
    if char_length(upper_letters)::numeric / char_length(letters)::numeric > 0.7 then
      return 'Mostly capitalized text is not allowed';
    end if;
  end if;
  return null;
end;
$$;

create or replace function public.symbolic_tone_block_reason(message_body text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  clean text := coalesce(message_body, '');
  policy text;
begin
  if clean = '' then return null; end if;

  -- Emoji detection stays on the original text.
  if clean ~ '[😀-🙏🌀-🫿☀-➿]' or clean ~ '[🇦-🇿]'
     or position(chr(65039) in clean) > 0 or position(chr(8419) in clean) > 0 then
    return 'Emoji are not allowed. Use words if you want to express a feeling.';
  end if;

  policy := normalize(clean, NFKC);
  policy := regexp_replace(
    policy,
    '[' ||
      chr(173) || chr(847) || chr(1564) ||
      chr(6155) || '-' || chr(6158) ||
      chr(8203) || '-' || chr(8207) ||
      chr(8234) || '-' || chr(8238) ||
      chr(8288) || '-' || chr(8303) ||
      chr(65024) || '-' || chr(65039) || chr(65279) ||
      chr(917504) || '-' || chr(917631) ||
      chr(917760) || '-' || chr(917999) ||
    ']',
    '',
    'g'
  );

  if policy ~ '([:;=8xX][-^'']?[()DPp/|]|<3|\^_\^|-_-)' then
    return 'Emoticons are not allowed. Use words if you want to express a feeling.';
  end if;
  return null;
end;
$$;

create or replace function public.safe_public_display_name(candidate text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  clean text := normalize(trim(coalesce(candidate, '')), NFKC);
  lowered text;
begin
  clean := regexp_replace(
    clean,
    '[' ||
      chr(173) || chr(847) || chr(1564) ||
      chr(6155) || '-' || chr(6158) ||
      chr(8203) || '-' || chr(8207) ||
      chr(8234) || '-' || chr(8238) ||
      chr(8288) || '-' || chr(8303) ||
      chr(65024) || '-' || chr(65039) || chr(65279) ||
      chr(917504) || '-' || chr(917631) ||
      chr(917760) || '-' || chr(917999) ||
    ']',
    '',
    'g'
  );
  clean := regexp_replace(trim(clean), '[[:space:]]+', ' ', 'g');

  if clean = '' or char_length(clean) > 50 then return 'Member'; end if;
  if public.symbolic_tone_block_reason(clean) is not null then return 'Member'; end if;
  lowered := lower(clean);
  if lowered ~ '(^|[^[:alpha:]])(hader|hate|hates|idiot|moron|stupid|crazy|insane|psycho|psychopath|bitch|asshole|cunt|røvhul|kælling|sindssyg|psykopat|narcissist|narcissistisk|dum|doven|egoist)([^[:alpha:]]|$)' then
    return 'Member';
  end if;
  return clean;
end;
$$;

-- Preserve the intended non-RPC helper posture established by prior migrations.
revoke execute on function public.normalize_personal_boundary(text) from public, anon, authenticated, service_role;
revoke execute on function public.free_message_block_reason(text) from public, anon;
revoke execute on function public.symbolic_tone_block_reason(text) from public, anon;
revoke execute on function public.safe_public_display_name(text) from public, anon;
