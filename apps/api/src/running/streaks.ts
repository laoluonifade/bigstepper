export const STREAK_TIME_ZONE = 'Africa/Lagos';
export const STREAK_DAY_SQL = `(a."startedAt" AT TIME ZONE '${STREAK_TIME_ZONE}')::date`;
