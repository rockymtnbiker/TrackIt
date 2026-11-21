import { REFLECTION_ANSWERS, REFLECTION_COPY } from '../constants/reflection';
import type { Connection } from '../types/community';
import type { CoachCheckin, PartnerCheckin } from './reviewApi';

export function formatQty(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function personName(connection: Connection): string {
  return connection.displayName?.trim() || connection.email?.trim() || 'your accountability partner';
}

export function partnerOutcome(value: PartnerCheckin | null): string | null {
  if (value === 'yes') return REFLECTION_COPY.partnerLineYes;
  if (value === 'not_yet') return REFLECTION_COPY.partnerLineNotYet;
  if (value === 'invited') return REFLECTION_COPY.partnerLineInvited;
  if (value === 'not_now') return REFLECTION_COPY.partnerLineNotNow;
  return null;
}

export function coachOutcome(value: CoachCheckin | null): string | null {
  if (value === 'yes') return REFLECTION_COPY.coachLineYes;
  if (value === 'not_yet') return REFLECTION_COPY.coachLineNotYet;
  if (value === 'requested') return REFLECTION_COPY.coachLineRequested;
  if (value === 'pending') return REFLECTION_COPY.coachLinePending;
  if (value === 'not_now') return REFLECTION_COPY.coachLineNotNow;
  return null;
}

export function answerLabel(answer: string): string {
  return REFLECTION_ANSWERS.find((option) => option.id === answer)?.label ?? answer;
}
