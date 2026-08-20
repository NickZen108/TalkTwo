export const ACCOUNT_DELETE_CONFIRMATION = 'DELETE';

export function accountDeleteConfirmed(value: string) {
  return value.trim() === ACCOUNT_DELETE_CONFIRMATION;
}
