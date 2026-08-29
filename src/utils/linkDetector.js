/**
 * Detects whether a message contains links, t.me links, or unwhitelisted URLs
 */
const URL_REGEX = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/[^\s]*)?)/gi;
const TG_LINK_REGEX = /(t\.me\/|telegram\.me\/|telegram\.dog\/)/i;

function extractUrls(text) {
  if (!text) return [];
  const matches = text.match(URL_REGEX);
  return matches ? matches.map(u => u.toLowerCase()) : [];
}

function hasTelegramLink(text) {
  if (!text) return false;
  return TG_LINK_REGEX.test(text);
}

function isDomainWhitelisted(url, whitelistedDomains = []) {
  if (!url) return false;
  const cleanUrl = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
  
  return whitelistedDomains.some(domain => {
    const cleanDomain = domain.toLowerCase().trim();
    return cleanUrl === cleanDomain || cleanUrl.endsWith(`.${cleanDomain}`);
  });
}

function checkLinks(text, allowTelegramLinks = false, whitelistedDomains = []) {
  if (!text) return { hasLinks: false, isAllowed: true, detectedUrls: [] };

  const urls = extractUrls(text);
  if (urls.length === 0) {
    return { hasLinks: false, isAllowed: true, detectedUrls: [] };
  }

  // Check each detected URL
  for (const url of urls) {
    const isTg = TG_LINK_REGEX.test(url);
    if (isTg && !allowTelegramLinks) {
      return { hasLinks: true, isAllowed: false, detectedUrls: urls, reason: 'telegram_link_disallowed' };
    }

    if (!isDomainWhitelisted(url, whitelistedDomains)) {
      return { hasLinks: true, isAllowed: false, detectedUrls: urls, reason: 'unwhitelisted_domain' };
    }
  }

  return { hasLinks: true, isAllowed: true, detectedUrls: urls };
}

module.exports = {
  extractUrls,
  hasTelegramLink,
  isDomainWhitelisted,
  checkLinks,
};
