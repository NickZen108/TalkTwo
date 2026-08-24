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

function configuredSiteUrl() {
  return process.env.EXPO_PUBLIC_TALKTWO_SITE_URL?.trim() ?? '';
}

export function talkTwoHttpsOrigin(siteUrl = configuredSiteUrl()) {
  if (!siteUrl) return null;
  try {
    const parsed = new URL(siteUrl);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) return null;
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

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  let pathSegments: string[];
  if (expectedOrigin) {
    if (parsed.protocol !== 'https:' || parsed.origin !== expectedOrigin) return null;
    pathSegments = parsed.pathname.split('/').filter(Boolean);
    if (pathSegments[0]?.toLowerCase() !== APP_PATH_PREFIX) return null;
    pathSegments = pathSegments.slice(1);
  } else {
    if (parsed.protocol.toLowerCase() !== CUSTOM_SCHEME) return null;
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
