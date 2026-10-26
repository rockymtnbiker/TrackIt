import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { supabase } from './supabase';

export type ConceptVoteChoice = 'yes' | 'no';

export type MyVote = {
  conceptKey: string;
  vote: ConceptVoteChoice;
  comment: string | null;
  updatedAt: string;
};

type VoteRow = {
  concept_key: string;
  vote: string;
  comment: string | null;
  updated_at: string;
};

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw error;
  }
  const userId = data.user?.id;
  if (!userId) {
    throw new Error('You must be signed in.');
  }
  return userId;
}

function appVersionLabel(): string {
  const version = Constants.expoConfig?.version ?? '';
  const updateId = Updates.updateId;
  if (version && updateId) {
    return `${version} (${updateId})`;
  }
  return version || updateId || '';
}

function asVote(value: string): ConceptVoteChoice | null {
  if (value === 'yes' || value === 'no') {
    return value;
  }
  return null;
}

export async function getMyVotes(): Promise<MyVote[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('concept_votes')
    .select('concept_key, vote, comment, updated_at')
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  const votes: MyVote[] = [];
  for (const row of (data as VoteRow[] | null) ?? []) {
    const vote = asVote(row.vote);
    if (!vote) {
      continue;
    }
    votes.push({
      conceptKey: row.concept_key,
      vote,
      comment: row.comment,
      updatedAt: row.updated_at,
    });
  }
  return votes;
}

export async function upsertVote(
  key: string,
  vote: ConceptVoteChoice,
  comment: string | null,
): Promise<void> {
  const userId = await requireUserId();
  const trimmed = comment?.trim() ?? '';
  const { error } = await supabase.from('concept_votes').upsert(
    {
      user_id: userId,
      concept_key: key,
      vote,
      comment: trimmed ? trimmed.slice(0, 500) : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,concept_key' },
  );

  if (error) {
    throw error;
  }
}

export async function sendFeedback(body: string, screen: string): Promise<void> {
  const userId = await requireUserId();
  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error('Write a note first.');
  }
  const { error } = await supabase.from('feedback').insert({
    user_id: userId,
    body: trimmed.slice(0, 2000),
    screen,
    app_version: appVersionLabel(),
  });

  if (error) {
    throw error;
  }
}
