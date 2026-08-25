export type TalkTwoLinkFamily = 'auth' | 'invite' | 'member' | 'recover-key' | 'premium-gift';

export interface TalkTwoLinkOptions {
  query?: Record<string, string>;
  fragment?: Record<string, string>;
}

export interface ParsedTalkTwoLink {
  family: string;
  pathSegments: string[];
  query: URLSearchParams;
  fragment: URLSearchParams;
}

const APP_PATH_PREFIX = 'app';
const CUSTOM_SCHEME = 'talktwo:';
const RAW_URL_CONTROLS = /[\u0000-\u001f\u007f]/;

function configuredSiteUrl() {
  return process.env.EXPO_PUBLIC_TALKTWO_SITE_URL?.trim() ?? '';
}

export function talkTwoHttpsOrigin(siteUrl = configuredSiteUrl()) {
  if (!siteUrl) return null;
  try {
    const parsed = new URL(siteUrl);
    // The production setting is an origin, not a website sub-path. Silently
    // discarding a configured path/query/fragment would make operators review
    // one URL while TalkTwo emits another. Non-default ports are intentionally
    // rejected because native associated-domain/app-link ownership is host based.
    if (
      parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password
      || parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash
    ) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function encodedParams(values?: Record<string, string>) {
  if (!values) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) params.append(key, value);
  return params.toString();
}

export function buildTalkTwoLink(
  family: TalkTwoLinkFamily,
  identifier?: string,
  options: TalkTwoLinkOptions = {},
  siteUrl = configuredSiteUrl(),
) {
  const configured = siteUrl.trim();
  const origin = talkTwoHttpsOrigin(configured);
  if (configured && !origin) {
    throw new Error('TalkTwo public link configuration is invalid.');
  }

  const idPath = identifier === undefined ? '' : `/${encodeURIComponent(identifier)}`;
  const route = `${family}${idPath}`;
  const query = encodedParams(options.query);
  const fragment = encodedParams(options.fragment);
  const suffix = `${query ? `?${query}` : ''}${fragment ? `#${fragment}` : ''}`;
  return origin
    ? `${origin}/${APP_PATH_PREFIX}/${route}${suffix}`
    : `${CUSTOM_SCHEME}//${route}${suffix}`;
}

export function parseTalkTwoLink(url: string, siteUrl = configuredSiteUrl()): ParsedTalkTwoLink | null {
  const configured = siteUrl.trim();
  const expectedOrigin = talkTwoHttpsOrigin(configured);
  if (configured && !expectedOrigin) return null;

  // WHATWG URL parsing intentionally trims/normalizes some raw ASCII whitespace
  // and control characters. Security-sensitive app links accept one canonical raw
  // representation instead of letting that normalization silently change input.
  if (!url || url !== url.trim() || RAW_URL_CONTROLS.test(url)) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  // Userinfo is never part of a TalkTwo link. URL.origin omits it, so it must be
  // rejected explicitly before same-origin comparison (for example
  // https://name@real-host/app/...). Custom-scheme userinfo is rejected too.
  if (parsed.username || parsed.password) return null;

  let pathSegments: string[];
  if (expectedOrigin) {
    if (parsed.protocol !== 'https:' || parsed.origin !== expectedOrigin) return null;
    pathSegments = parsed.pathname.split('/').filter(Boolean);
    if (pathSegments[0]?.toLowerCase() !== APP_PATH_PREFIX) return null;
    pathSegments = pathSegments.slice(1);
  } else {
    if (parsed.protocol.toLowerCase() !== CUSTOM_SCHEME || parsed.port) return null;
    pathSegments = [parsed.hostname, ...parsed.pathname.split('/').filter(Boolean)].filter(Boolean);
  }

  if (!pathSegments[0]) return null;
  const family = pathSegments[0].toLowerCase();
  return {
    family,
    pathSegments: [family, ...pathSegments.slice(1)],
    query: parsed.searchParams,
    fragment: new URLSearchParams(parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash),
  };
}
