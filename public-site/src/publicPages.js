import './styles.css';
import { missingPublicationFields, publicSiteConfig, publicationReady } from './siteConfig.js';

const config = publicSiteConfig();
const ready = publicationReady(config);

for (const node of document.querySelectorAll('[data-config]')) {
  const key = node.getAttribute('data-config');
  if (!key || !(key in config)) continue;
  node.textContent = config[key] || 'Not configured';
}

for (const link of document.querySelectorAll('[data-mailto]')) {
  const key = link.getAttribute('data-mailto');
  const email = key && key in config ? config[key] : '';
  if (email) {
    link.href = `mailto:${email}`;
    link.textContent = email;
  } else {
    link.removeAttribute('href');
    link.textContent = 'Not configured';
  }
}

for (const banner of document.querySelectorAll('[data-publication-status]')) {
  if (ready) {
    banner.hidden = true;
  } else {
    const missing = missingPublicationFields(config);
    banner.hidden = false;
    banner.textContent = `Draft preview — not ready for publication. Missing final reviewed configuration: ${missing.join(', ')}.`;
  }
}

document.documentElement.dataset.publicationReady = ready ? 'true' : 'false';
