export type Connection = {
  id: string;
  partnerId: string | null;
  email: string | null;
  displayName: string | null;
  status: string;
  /** `partner` or `coach` from my_connections. Null when the row uses role for something else. */
  role: 'partner' | 'coach' | null;
  /** True when this user received the invite. Null when the row does not say. */
  incoming: boolean | null;
  /** True when this user blocked the partner. False when the partner blocked this user. Null when the row does not say. */
  blockedByMe: boolean | null;
  createdAt: string;
};

export type GoalShare = {
  ownerId: string;
  viewerId: string;
  goalId: string;
  createdAt: string;
};

export type GoalComment = {
  id: string;
  goalId: string;
  ownerId: string;
  partnerId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  mine: boolean;
};
