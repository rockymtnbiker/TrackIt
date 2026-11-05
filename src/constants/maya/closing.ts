/** Wording for the screen Maya shows after a goal is saved. */

export const MAYA_CLOSING = {
  nice: 'Nice work, [name].',
  niceNoName: 'Nice work.',
  coach:
    'This is about as far as I can take you on my own. An Achievement Coach can help you break down your next steps, work through potential barriers, and build momentum.',
  talk: 'Talk with an Achievement Coach',
  another: "Let's write another goal",
  done: "I'm good for now",
} as const;

export function closingHello(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return MAYA_CLOSING.niceNoName;
  }
  return MAYA_CLOSING.nice.replace('[name]', trimmed);
}
