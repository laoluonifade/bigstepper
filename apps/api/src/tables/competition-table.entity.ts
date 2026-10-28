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
  type: string;

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

  @Column({ type: 'integer', nullable: true })
  dailyTarget: number | null;

  @Column({ type: 'integer', nullable: true })
  minSessions: number | null;

  @Column({ type: 'integer', nullable: true })
  minActivityMetres: number | null;

  @Column({ type: 'integer', nullable: true })
  minActivitySeconds: number | null;

  @Column({ type: 'jsonb' })
  eligibleActivities: ActivityType[];

  @Column({ type: 'varchar', length: 16, default: 'open' })
  format: CompetitionFormat;

  @Column({ type: 'varchar', length: 64, default: 'Africa/Lagos' })
  timeZone: string;

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

  @Column({ type: 'varchar', length: 10, default: 'public' })
  visibility: 'public' | 'private';

  @Column()
  creatorId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'creatorId' })
  creator: User;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  prizeDeliveryCountries: string[];

  @Column({ type: 'varchar', length: 10, nullable: true })
  prizeFulfilment: 'club' | 'jump' | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  prizeShipping: 'club' | 'jump' | 'other' | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  prizeShippingNote: string | null;

  @Column({ type: 'varchar', length: 600, nullable: true })
  prizeEligibilityNote: string | null;

  @Column({ type: 'varchar', length: 600, nullable: true })
  bannerUrl: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  podiumAnnouncedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @Column({ type: 'integer', default: 14 })
  prizeClaimDays: number;

  @Column({ type: 'varchar', length: 8, default: 'top' })
  prizeSelection: 'top' | 'draw';

  @Column({ type: 'timestamptz', nullable: true })
  prizesFinalizedAt: Date | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  eligibleCountries: string[];

  @Column({ type: 'timestamptz', nullable: true })
  publishAt: Date | null;

  @Column({ default: false })
  autoEnrolClub: boolean;

  @Column({ type: 'varchar', length: 8, default: 'all' })
  enrolAudience: 'all' | 'run' | 'walk' | 'cycle';

  @Column({ type: 'uuid', nullable: true })
  seriesId: string | null;

  @Column({ type: 'integer', nullable: true })
  edition: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  promotedUntil: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
