import { supabase } from './supabase';

export type HelpType = 'setup' | 'checkins' | 'life';
export type ContactMethod = 'text' | 'email';

export type SupportRequest = {
  id: string;
  helpType: HelpType;
  details: string | null;
  contactMethod: ContactMethod;
  contactValue: string;
  status: string;
  createdAt: string;
};

type SupportRequestRow = {
  id: string;
  help_type: HelpType;
  details: string | null;
  contact_method: ContactMethod;
  contact_value: string;
  status: string;
  created_at: string;
};

const COLUMNS =
  'id, help_type, details, contact_method, contact_value, status, created_at';

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

function mapRow(row: SupportRequestRow): SupportRequest {
  return {
    id: row.id,
    helpType: row.help_type,
    details: row.details,
    contactMethod: row.contact_method,
    contactValue: row.contact_value,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function getLatestSupportRequest(): Promise<SupportRequest | null> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('support_requests')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }
  return mapRow(data as SupportRequestRow);
}

export async function createSupportRequest(input: {
  helpType: HelpType;
  details: string | null;
  contactMethod: ContactMethod;
  contactValue: string;
}): Promise<SupportRequest> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('support_requests')
    .insert({
      user_id: userId,
      help_type: input.helpType,
      details: input.details,
      contact_method: input.contactMethod,
      contact_value: input.contactValue,
    })
    .select(COLUMNS)
    .single();

  if (error) {
    throw error;
  }
  return mapRow(data as SupportRequestRow);
}
