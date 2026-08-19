export type Plan = 'free' | 'premium' | 'trial';
export type DeliveryState = 'queued' | 'delivered' | 'opened' | 'withdrawn';
export type MessageRisk = 'green' | 'yellow' | 'red';

export interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  timezone: string;
  plan: Plan;
  coachEnabled: boolean;
}

export interface Relationship {
  id: string;
  memberIds: string[];
  blocked: boolean;
  createdAt: string;
}

export interface Message {
  id: string;
  relationshipId: string;
  senderId: string;
  recipientId: string;
  body: string;
  risk: MessageRisk;
  createdAt: string;
  deliverAfter: string;
  deliveredAt?: string;
  openedAt?: string;
  withdrawnAt?: string;
  state: DeliveryState;
}

export interface DailyWindow {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  enabled: boolean;
  startLocal: string;
  endLocal: string;
}

export interface PersonalBoundary {
  id: string;
  userId: string;
  phrase: string;
  enabled: boolean;
}
