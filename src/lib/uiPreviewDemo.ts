import type { RelationshipMember, RelationshipSummary } from '../services/relationships';

const ME = 'ui-preview-user';
const NOW = '2026-08-26T12:00:00.000Z';

export const UI_PREVIEW_RELATIONSHIPS: RelationshipSummary[] = [
  {
    id: 'ui-preview-rel-maya',
    status: 'active',
    created_at: NOW,
    my_role: 'participant',
    member_count: 2,
  },
  {
    id: 'ui-preview-rel-family',
    status: 'active',
    created_at: NOW,
    my_role: 'participant',
    member_count: 4,
  },
];

function member(userId: string, name: string, role: 'participant' | 'observer' = 'participant'): RelationshipMember {
  return {
    user_id: userId,
    display_name: name,
    role,
    joined_at: NOW,
    blocked_by_me: false,
    is_extra: false,
    subscription_status: null,
    current_period_end: null,
    renewal_approved_by_me: null,
  };
}

export const UI_PREVIEW_MEMBERS: Record<string, RelationshipMember[]> = {
  'ui-preview-rel-maya': [
    member(ME, 'Dig'),
    member('ui-preview-maya', 'Maya'),
  ],
  'ui-preview-rel-family': [
    member(ME, 'Dig'),
    member('ui-preview-maya', 'Maya'),
    member('ui-preview-daughter', 'Datter'),
    member('ui-preview-son', 'Rolf'),
  ],
};
