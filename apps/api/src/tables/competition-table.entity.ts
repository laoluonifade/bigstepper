import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { ChallengeType, ScoringMethod } from './challenge-types';

@Entity('competition_tables')
export class CompetitionTable {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

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

  @Column({ type: 'uuid', nullable: true })
  communityId: string | null;

  @Column({ type: 'integer', default: 3000 })
  platformFeeBps: number;

  @Column({ type: 'integer', default: 0 })
  creatorCommissionBps: number;

  @Column({ type: 'bigint', nullable: true, transformer: { to: (value: number | null) => value, from: (value: string | null) => value === null ? null : Number(value) } })
  guaranteedPrizeKobo: number | null;

  @Column({ type: 'jsonb', default: () => "'[10000]'::jsonb" })
  prizeSplitBps: number[];

  @Column({ type: 'timestamptz', nullable: true })
  fundedAt: Date | null;

  @Column({ type: 'integer', default: 1 })
  minimumEntrants: number;

  @Column()
  creatorId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'creatorId' })
  creator: User;

  @CreateDateColumn()
  createdAt: Date;
}
