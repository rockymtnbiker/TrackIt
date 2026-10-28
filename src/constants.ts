/** Pace and completion status. Red stays reserved for real errors. */
export const STATUS_COLORS = {
  positive: '#248A3D',
  encourage: '#A16207',
} as const;

/** Suggested units. Any other unit is free text stored on the step. */
export const UNIT_OPTIONS = [
  'minutes',
  'hours',
  'miles',
  'km',
  'reps',
  'pages',
  'times',
] as const;
