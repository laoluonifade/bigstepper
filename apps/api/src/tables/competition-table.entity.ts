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

  /** Product prizes: the brand or run club putting them up (null for cash or no prizes). */
  @Column({ type: 'uuid', nullable: true })
  sponsorId: string | null;

  /** Countries the sponsor delivers to; only residents of these can win the products. */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  prizeDeliveryCountries: string[];

  /** Who delivers: the sponsor by default, or Jump where agreed. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  prizeFulfilment: 'sponsor' | 'jump' | null;

  /** Who pays shipping, so winners never face surprise charges. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  prizeShipping: 'sponsor' | 'jump' | 'other' | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  prizeShippingNote: string | null;

  @Column({ type: 'varchar', length: 600, nullable: true })
  prizeEligibilityNote: string | null;

  /** Days a winner has to send delivery details before the prize passes to the next eligible finisher. */
  @Column({ type: 'integer', default: 14 })
  prizeClaimDays: number;

  /** When the sponsor committed to the prizes and delivery coverage (before it can open). */
  @Column({ type: 'timestamptz', nullable: true })
  sponsorCommittedAt: Date | null;

  /** When winners were decided and their prizes assigned. */
  @Column({ type: 'timestamptz', nullable: true })
  prizesFinalizedAt: Date | null;

  /** Tidied away by the host once over: off every list, still at its link. */
  @Column({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
