export type Connection = {
  id: string;
  partnerId: string | null;
  email: string | null;
  displayName: string | null;
  status: string;
  /** True when this user received the invite. Null when the row does not say. */
  incoming: boolean | null;
  /** True when this user blocked the partner. False when the partner blocked this user. Null when the row does not say. */
  blockedByMe: boolean | null;
  createdAt: string;
};

export type GoalShare = {
  id: string;
  ownerId: string;
  viewerId: string;
  goalId: string;
  createdAt: string;
};
