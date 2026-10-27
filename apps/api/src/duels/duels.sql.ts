const person = (userId: string) => `(SELECT json_build_object(
    'userId', p."userId", 'username', p."username", 'displayName', p."displayName", 'avatarUrl', p."avatarUrl",
    'avatarStyle', CASE WHEN p."gender"='male' THEN 'masculine' WHEN p."gender"='female' THEN 'feminine' ELSE 'neutral' END,
    'verified', p."verifiedAt" IS NOT NULL)
  FROM "profiles" p WHERE p."userId"=${userId})`;

export const duelJson = (d: string) => `CASE WHEN ${d}."id" IS NULL THEN NULL ELSE json_build_object(
  'id', ${d}."id", 'status', ${d}."status", 'activity', ${d}."activity", 'targetMetres', ${d}."targetMetres", 'minutes', ${d}."minutes",
  'challengerId', ${d}."challengerId", 'opponentId', ${d}."opponentId", 'acceptedAt', ${d}."acceptedAt",
  'challengerReadyAt', ${d}."challengerReadyAt", 'opponentReadyAt', ${d}."opponentReadyAt",
  'startsAt', ${d}."startsAt", 'endsAt', ${d}."endsAt", 'expiresAt', ${d}."expiresAt", 'settledAt', ${d}."settledAt",
  'challengerMetres', ${d}."challengerMetres", 'opponentMetres', ${d}."opponentMetres",
  'challengerReachedAt', ${d}."challengerReachedAt", 'opponentReachedAt', ${d}."opponentReachedAt", 'winnerId', ${d}."winnerId",
  'challenger', ${person(`${d}."challengerId"`)}, 'opponent', ${person(`${d}."opponentId"`)}) END`;

export const OPEN_STATUSES = `('PENDING','ACCEPTED','LIVE')`;
