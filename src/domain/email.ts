export function normalizeGiftRecipientEmail(value: string) {
  const normalized = value.trim().toLocaleLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}
