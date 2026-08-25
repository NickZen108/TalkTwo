-- Keep the authoritative server-side Free-tier policy aligned with the mobile
-- deterministic filter. The UI already blocks these degrading adjectives, but
-- server enforcement must make the same decision for modified or stale clients.

create or replace function public.free_message_block_reason(message_body text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  clean text := trim(coalesce(message_body, ''));
  policy text;
  lowered text;
  letters text;
  upper_letters text;
begin
  if char_length(clean) = 0 then return 'Message cannot be empty'; end if;
  if char_length(clean) > 160 then return 'Free messages are limited to 160 characters'; end if;

  if clean ~ '[😀-🙏🌀-🫿☀-➿]' or clean ~ '[🇦-🇿]'
     or position(chr(65039) in clean) > 0 or position(chr(8419) in clean) > 0 then
    return 'Emoji or emoticons are not allowed in Free messages';
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
  lowered := lower(policy);

  if position('!' in policy) > 0 then
    return 'Exclamation marks are not allowed in Free messages';
  end if;

  if policy ~ '([:;=8xX][-^'']?[()DPp]|<3)' then
    return 'Emoji or emoticons are not allowed in Free messages';
  end if;

  if lowered ~ '(^|[^[:alpha:]])(fuck|fucked|fucker|fuckers|fucking|motherfucker|motherfuckers|shit|bullshit|bitch|bitches|asshole|assholes|cunt|cunts|dickhead|dickheads|bastard|bastards|prick|pricks|wanker|wankers|twat|twats|idiot|idiots|moron|morons|dumb|stupid|crazy|insane|retard|retarded|pathetic|useless|incompetent|ridiculous|fandme|fanden|satme|kraftedeme|krafteme|lort|lorte|pis|pisse|røvhul|røvhuller|kælling|kællinger|idioter|nar|narrer|svin|klaphat|klaphatte|dum|dumme|sindssyg|sindssygt|sindssyge|retarderet|retarderede|patetisk|patetiske|ubrukelig|ubrugelig|ubrugelige|inkompetent|inkompetente|latterlig|latterligt|latterlige)([^[:alpha:]]|$)'
     or lowered ~ '(^|[^[:alpha:]])(fuck[[:space:]]+you|fuck[[:space:]]+dig|hold[[:space:]]+kæft|shut[[:space:]]+up)([^[:alpha:]]|$)' then
    return 'Profanity, direct insults or degrading language are not allowed';
  end if;

  if policy ~ '([?.;,])\1+'
     or lowered ~ '([[:alpha:]])\1{3,}'
     or lowered ~ '(^|[^[:alpha:]])([[:alpha:]]{2,})([[:space:],.;:-]+\2){2,}([^[:alpha:]]|$)' then
    return 'Repeated words, letters or punctuation are not allowed';
  end if;

  if policy ~ '[A-ZÆØÅÄÖÜ]{5,}' then
    return 'Long runs of capital letters are not allowed';
  end if;

  letters := regexp_replace(policy, '[^A-Za-zÆØÅÄÖÜæøåäöü]', '', 'g');
  if char_length(letters) >= 10 then
    upper_letters := regexp_replace(letters, '[^A-ZÆØÅÄÖÜ]', '', 'g');
    if char_length(upper_letters)::numeric / char_length(letters)::numeric > 0.65 then
      return 'Mostly capitalized text is not allowed';
    end if;
  end if;

  return null;
end;
$$;

revoke execute on function public.free_message_block_reason(text) from public, anon;
grant execute on function public.free_message_block_reason(text) to authenticated, service_role;
