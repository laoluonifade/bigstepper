import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { ChallengeType, ScoringMethod } from './challenge-types';
import { ActivityType, CompetitionFormat } from './competition-rules';

@Entity('competition_tables')
export class CompetitionTable {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'varchar', length: 280, nullable: true })
  description: string | null;

  @Column({ unique: true })
  code: string;

  @Column({ default: 'free' })
  type: string; // free, sponsored, paid (gated)

  @Column({ default: 'OPEN_FOR_ENTRY' })
  status: string;

  @Column({ type: 'integer', default: 0 })
  entryFeeKobo: number;

  @Column({ type: 'timestamptz', nullable: true })
  scoringClosesAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  startsAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  entryClosesAt: Date | null;

  @Column({ type: 'integer', nullable: true })
  capacity: number | null;

  @Column({ type: 'integer', nullable: true })
  distanceCapMetres: number | null;

  @Column({ default: 'RUN' })
  challengeType: ChallengeType;

  @Column({ default: 'FARTHEST_DISTANCE' })
  scoringMethod: ScoringMethod;

  @Column({ type: 'integer', nullable: true })
  targetDistanceMetres: number | null;

  @Column({ type: 'integer', nullable: true })
  targetSteps: number | null;

  @Column({ type: 'integer', nullable: true })
  targetSeconds: number | null;

  @Column({ type: 'integer', nullable: true })
  targetSessions: number | null;

  /** The daily bar (streaks, target days) or minimum daily average, in metres, steps or seconds. */
  @Column({ type: 'integer', nullable: true })
  dailyTarget: number | null;

  /** Fewer qualifying sessions than this and an entrant ranks after everyone who met it. */
  @Column({ type: 'integer', nullable: true })
  minSessions: number | null;

  /** Activities shorter than these don't qualify at all. */
  @Column({ type: 'integer', nullable: true })
  minActivityMetres: number | null;

  @Column({ type: 'integer', nullable: true })
  minActivitySeconds: number | null;

  @Column({ type: 'jsonb' })
  eligibleActivities: ActivityType[];

  @Column({ type: 'varchar', length: 16, default: 'open' })
  format: CompetitionFormat;

  /** Days and streaks follow this zone's calendar. */
  @Column({ type: 'varchar', length: 64, default: 'Africa/Lagos' })
  timeZone: string;

  /** 1: scored as before the rules engine (kept for competitions created then). 2: the engine's rules. */
  @Column({ type: 'integer', default: 2 })
  rulesVersion: number;

  @Column({ type: 'time', nullable: true })
  reminderTime: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  reminderTimeZone: string | null;

  @Column({ type: 'uuid', nullable: true })
  communityId: string | null;

  @Column({ type: 'integer', default: 3000 })
  platformFeeBps: number;

  @Column({ type: 'integer', default: 0 })
  creatorCommissionBps: number;

  @Column({ type: 'bigint', nullable: true, transformer: { to: (value: number | null) => value, from: (value: string | null) => value === null ? null : Number(value) } })
  guaranteedPrizeKobo: number | null;

  @Column({ type: 'varchar', length: 16, default: 'WINNERS' })
  fundingDestination: 'WINNERS' | 'CHARITY';

  @Column({ type: 'varchar', length: 120, nullable: true })
  charityName: string | null;

  @Column({ type: 'jsonb', default: () => "'[10000]'::jsonb" })
  prizeSplitBps: number[];

  @Column({ type: 'timestamptz', nullable: true })
  fundedAt: Date | null;

  @Column({ type: 'integer', default: 1 })
  minimumEntrants: number;

  /** Private competitions are hidden from browsing; only the host and invited runners can join. */
  @Column({ type: 'varchar', length: 10, default: 'public' })
  visibility: 'public' | 'private';

  @Column()
  creatorId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'creatorId' })
  creator: User;

  /** Countries the club delivers prizes to; only residents of these can win them. */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  prizeDeliveryCountries: string[];

  /** Set when the challenge has club prizes: who delivers them, the club or Jump where agreed. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  prizeFulfilment: 'club' | 'jump' | null;

  /** Who pays shipping, so winners never face surprise charges. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  prizeShipping: 'club' | 'jump' | 'other' | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  prizeShippingNote: string | null;

  @Column({ type: 'varchar', length: 600, nullable: true })
  prizeEligibilityNote: string | null;

  /** Days a winner has to send delivery details before the prize passes to the next eligible finisher. */
  @Column({ type: 'integer', default: 14 })
  prizeClaimDays: number;

  /** top: prizes go down the final standings. draw: a recorded random draw among qualifying finishers. */
  @Column({ type: 'varchar', length: 8, default: 'top' })
  prizeSelection: 'top' | 'draw';

  /** When winners were decided and their prizes assigned. */
  @Column({ type: 'timestamptz', nullable: true })
  prizesFinalizedAt: Date | null;

  /** Only people whose profile country is listed can join (empty: anyone). */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  eligibleCountries: string[];

  /** DRAFT and SCHEDULED challenges aren't public yet; SCHEDULED ones open at this time. */
  @Column({ type: 'timestamptz', nullable: true })
  publishAt: Date | null;

  /** Enter the whole club when it opens (kept so a draft or scheduled challenge does it on publish). */
  @Column({ default: false })
  autoEnrolClub: boolean;

  /** The recurring series this is an edition of, and which edition. */
  @Column({ type: 'uuid', nullable: true })
  seriesId: string | null;

  @Column({ type: 'integer', nullable: true })
  edition: number | null;

  /** Premium placement: listed first in discovery until then. */
  @Column({ type: 'timestamptz', nullable: true })
  promotedUntil: Date | null;

  /** Tidied away by the host once over: off every list, still at its link. */
  @Column({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
