export interface TalkTwoPublicSiteLinks {
  privacy: string;
  terms: string;
  support: string;
  deleteAccount: string;
}

export function buildTalkTwoPublicSiteLinks(rawBaseUrl: string | undefined): TalkTwoPublicSiteLinks | null {
  const candidate = rawBaseUrl?.trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    url.search = '';
    url.hash = '';
    const base = url.toString().replace(/\/$/, '');
    return {
      privacy: `${base}/privacy/`,
      terms: `${base}/terms/`,
      support: `${base}/support/`,
      deleteAccount: `${base}/delete-account/`,
    };
  } catch {
    return null;
  }
}

export const talkTwoPublicSiteLinks = buildTalkTwoPublicSiteLinks(process.env.EXPO_PUBLIC_TALKTWO_SITE_URL);
