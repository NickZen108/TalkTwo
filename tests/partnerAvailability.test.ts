import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPartnerAvailability } from '../src/domain/partnerAvailability';
import { partnerAvailabilityText } from '../src/i18n/partnerAvailabilityCopy';
import type { PartnerWindow } from '../src/services/windows';

function row(overrides: Partial<PartnerWindow> = {}): PartnerWindow {
  return {
    user_id: 'partner',
    timezone: 'UTC',
    weekday: 1,
    start_local: '08:00:00',
    end_local: '18:00:00',
    enabled: true,
    ...overrides,
  };
}

test('shows an enabled partner window as open during its local hours', () => {
  const [availability] = buildPartnerAvailability([row()], new Date('2026-08-24T10:00:00Z'));
  assert.equal(availability.localTime, '10:00');
  assert.equal(availability.start, '08:00');
  assert.equal(availability.end, '18:00');
  assert.equal(availability.isOpen, true);
  assert.equal(availability.closedToday, false);
  assert.match(partnerAvailabilityText(availability, 'Alex', 'en'), /Alex: open now · 08:00–18:00/);
});

test('a configured schedule with no enabled row for today is closed today', () => {
  const [availability] = buildPartnerAvailability([
    row({ weekday: 2 }),
    row({ weekday: 3, enabled: false }),
  ], new Date('2026-08-24T10:00:00Z'));
  assert.equal(availability.configured, true);
  assert.equal(availability.closedToday, true);
  assert.equal(availability.isOpen, false);
  assert.match(partnerAvailabilityText(availability, 'Alex', 'da'), /lukket i dag/);
});

test('a partner with no configured schedule is always available', () => {
  const [availability] = buildPartnerAvailability([
    row({ weekday: null, start_local: null, end_local: null, enabled: null }),
  ], new Date('2026-08-24T10:00:00Z'));
  assert.equal(availability.configured, false);
  assert.equal(availability.isOpen, true);
  assert.match(partnerAvailabilityText(availability, 'Alex', 'en'), /always open/);
});

test('timezone conversion uses the partner timezone for current status', () => {
  const [availability] = buildPartnerAvailability([
    row({ timezone: 'Europe/Copenhagen', start_local: '11:00:00', end_local: '13:00:00' }),
  ], new Date('2026-08-24T10:00:00Z'));
  assert.equal(availability.localTime, '12:00');
  assert.equal(availability.isOpen, true);
});

test('malformed enabled window times fail closed instead of throwing', () => {
  const [availability] = buildPartnerAvailability([
    row({ start_local: '25:00:00', end_local: '99:00:00' }),
  ], new Date('2026-08-24T10:00:00Z'));
  assert.equal(availability.isOpen, false);
  assert.equal(availability.configured, true);
});
