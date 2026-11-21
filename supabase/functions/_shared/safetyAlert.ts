export type AlertKind = 'urgent' | 'urgent (self-harm)' | 'new report' | 'auto-flag' | 'chat error';

export async function sendSafetyAlert(input: {
  kind: AlertKind;
  groupName: string;
  senderName: string;
  senderId: string;
  reason: string;
  categories: unknown;
  message: string;
  flagId: string | null;
}): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const to = Deno.env.get('ALERT_EMAIL');
  if (!apiKey || !to) {
    return;
  }
  const text = [
    `Group: ${input.groupName}`,
    `Sender: ${input.senderName} (${input.senderId})`,
    `Reason: ${input.reason}`,
    `Categories: ${JSON.stringify(input.categories ?? [])}`,
    `Message: ${input.message}`,
    `Time: ${new Date().toISOString()}`,
    `moderation_flags id: ${input.flagId ?? ''}`,
  ].join('\n');
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'onboarding@resend.dev',
      to: [to],
      subject: `TrackIt: ${input.kind} in ${input.groupName}`,
      text,
    }),
  });
}
