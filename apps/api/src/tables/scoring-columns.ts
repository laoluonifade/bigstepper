import { BadRequestException } from '@nestjs/common';
import { assertScoringConfiguration } from './challenge-types';
import { ChallengeType, dailyMeasure, eligibleKinds, METRICS, ScoringMethod } from './competition-rules';
import { ScoringFieldsDto } from './dto/scoring-fields.dto';

export function scoringColumns(input: ScoringFieldsDto & { challengeType: ChallengeType; scoringMethod: ScoringMethod; targetDistanceMetres?: number; reminderTimeZone?: string }, prizes: boolean) {
  const metric = METRICS[input.scoringMethod];
  const daily = dailyMeasure(input.challengeType, input.scoringMethod);
  const columns = {
    challengeType: input.challengeType,
    scoringMethod: input.scoringMethod,
    targetDistanceMetres: metric?.target === 'distance' ? input.targetDistanceMetres ?? null : null,
    targetSteps: metric?.target === 'steps' ? input.targetSteps ?? null : null,
    targetSeconds: metric?.target === 'time' ? input.targetSeconds ?? null : null,
    targetSessions: metric?.target === 'sessions' ? input.targetSessions ?? null : null,
    dailyTarget: daily ? input.dailyTarget ?? null : null,
    minSessions: input.minSessions ?? null,
    minActivityMetres: input.minActivityMetres ?? null,
    minActivitySeconds: input.minActivitySeconds ?? null,
    eligibleActivities: input.challengeType === 'TIMED' && input.eligibleActivities?.length
      ? [...new Set(input.eligibleActivities)]
      : eligibleKinds(input.challengeType),
    timeZone: validTimeZone(input.timeZone) ?? validTimeZone(input.reminderTimeZone) ?? 'Africa/Lagos',
    rulesVersion: 2,
  };
  try {
    assertScoringConfiguration({ ...columns, prizes });
  } catch (error) {
    throw new BadRequestException(error instanceof Error ? error.message : 'Invalid competition scoring');
  }
  return columns;
}

function validTimeZone(zone: string | undefined) {
  if (!zone) return null;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}
