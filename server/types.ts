export interface PushSubscriptionLike {
  endpoint: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
}

export interface EventType {
  id: string;
  name: string;
  color: string;
}

export interface EventTime {
  hour: number;
  minute: number;
}