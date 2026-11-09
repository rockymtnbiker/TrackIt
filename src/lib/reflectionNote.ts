let sentTo: string | null = null;

/** The reflection reads this when the chat closes after a note is sent. */
export function markReflectionNoteSent(name: string): void {
  sentTo = name;
}

export function takeReflectionNoteSent(): string | null {
  const name = sentTo;
  sentTo = null;
  return name;
}
