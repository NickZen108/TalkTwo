import { createClient } from '@supabase/supabase-js';
import './styles.css';

const config = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL?.trim(),
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim(),
  supportEmail: import.meta.env.VITE_SUPPORT_EMAIL?.trim(),
};

const requestSection = document.querySelector('#request-section');
const deleteSection = document.querySelector('#delete-section');
const deletedSection = document.querySelector('#deleted-section');
const configError = document.querySelector('#config-error');
const requestForm = document.querySelector('#request-form');
const requestButton = document.querySelector('#request-button');
const requestStatus = document.querySelector('#request-status');
const emailInput = document.querySelector('#email');
const signedInEmail = document.querySelector('#signed-in-email');
const deleteForm = document.querySelector('#delete-form');
const deleteButton = document.querySelector('#delete-button');
const deleteStatus = document.querySelector('#delete-status');
const confirmationInput = document.querySelector('#confirmation');
const signOutButton = document.querySelector('#sign-out-button');
const supportLink = document.querySelector('#support-link');
const genericLinkMessage = 'If this email belongs to an existing TalkTwo account, a secure sign-in link has been sent. Open the newest link on this device.';

function validEmail(value) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function validPublishableKey(value) {
  return Boolean(value && /^sb_publishable_[A-Za-z0-9_-]+$/.test(value));
}

function validPublicConfig() {
  try {
    const url = new URL(config.supabaseUrl ?? '');
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && validPublishableKey(config.publishableKey)
      && validEmail(config.supportEmail);
  } catch {
    return false;
  }
}

function showOnly(section) {
  for (const item of [requestSection, deleteSection, deletedSection]) item.hidden = item !== section;
}

function setBusy(button, busy, label, busyLabel) {
  button.disabled = busy;
  button.textContent = busy ? busyLabel : label;
}

if (!validPublicConfig()) {
  configError.hidden = false;
  configError.textContent = 'TalkTwo account deletion is not configured correctly yet.';
  showOnly(null);
} else {
  supportLink.href = `mailto:${config.supportEmail}`;

  const supabase = createClient(config.supabaseUrl, config.publishableKey, {
    auth: {
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  async function verifiedCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) return null;
    return user;
  }

  async function renderSession() {
    const user = await verifiedCurrentUser();
    if (!user) {
      showOnly(requestSection);
      return;
    }

    signedInEmail.textContent = user.email;
    confirmationInput.value = '';
    deleteButton.disabled = true;
    deleteStatus.textContent = '';
    showOnly(deleteSection);
  }

  requestForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    if (!validEmail(email)) return;

    requestStatus.textContent = '';
    setBusy(requestButton, true, 'Email me a secure sign-in link', 'Sending…');
    try {
      const redirectTo = new URL('/delete-account/', window.location.origin).toString();
      await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: redirectTo,
        },
      });
    } finally {
      // Keep the same response for existing and unknown addresses so the page
      // does not become an account-enumeration endpoint.
      requestStatus.textContent = genericLinkMessage;
      setBusy(requestButton, false, 'Email me a secure sign-in link', 'Sending…');
    }
  });

  confirmationInput.addEventListener('input', () => {
    deleteButton.disabled = confirmationInput.value.trim().toUpperCase() !== 'DELETE';
  });

  deleteForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (confirmationInput.value.trim().toUpperCase() !== 'DELETE') return;

    deleteStatus.textContent = '';
    setBusy(deleteButton, true, 'Delete account permanently', 'Deleting…');
    try {
      const user = await verifiedCurrentUser();
      if (!user) throw new Error('authentication_required');

      const { data, error } = await supabase.functions.invoke('delete-account', {
        body: { confirmation: 'DELETE' },
      });
      if (error || data?.deleted !== true) throw error ?? new Error('delete_failed');

      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      history.replaceState({}, '', '/delete-account/');
      showOnly(deletedSection);
    } catch {
      deleteStatus.textContent = 'The account could not be deleted. The secure session may have expired. Sign out, request a new link and try again, or contact support.';
      deleteButton.disabled = confirmationInput.value.trim().toUpperCase() !== 'DELETE';
    } finally {
      if (!deletedSection.hidden) return;
      setBusy(deleteButton, false, 'Delete account permanently', 'Deleting…');
      deleteButton.disabled = confirmationInput.value.trim().toUpperCase() !== 'DELETE';
    }
  });

  signOutButton.addEventListener('click', async () => {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    signedInEmail.textContent = '';
    showOnly(requestSection);
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user?.email) {
      void renderSession();
    }
  });

  void renderSession();
}
