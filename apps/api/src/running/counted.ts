export const COUNTED_STATUSES = `('VERIFIED','FLAGGED','PENDING_VERIFICATION')`;

export const countedMetres = (alias = 'a') =>
  `CASE WHEN ${alias}."verificationStatus"='PENDING_VERIFICATION' THEN ${alias}."recordedDistanceMetres" ELSE GREATEST(${alias}."validatedDistanceMetres", ${alias}."stepDistanceMetres") END`;

export const countedSteps = (alias = 'a') =>
  `CASE WHEN ${alias}."verificationStatus"='PENDING_VERIFICATION' THEN ${alias}."recordedSteps" ELSE ${alias}."validatedSteps" END`;
