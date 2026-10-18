import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { RunningSession } from './running-session.entity';

@Entity('activities')
@Index(['userId', 'startedAt'])
export class Activity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  runningSessionId: string;

  @ManyToOne(() => RunningSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'runningSessionId' })
  runningSession: RunningSession;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ default: 'PENDING_VERIFICATION' })
  verificationStatus: 'PENDING_VERIFICATION' | 'VERIFIED' | 'FLAGGED' | 'REJECTED';

  @Column({ default: 'run' })
  activityType: 'walk' | 'run';

  @Column({ type: 'integer', default: 0 })
  recordedDistanceMetres: number;

  @Column({ type: 'integer', default: 0 })
  validatedDistanceMetres: number;

  @Column({ type: 'integer', default: 0 })
  recordedSteps: number;

  @Column({ type: 'integer', default: 0 })
  validatedSteps: number;

  @Column({ type: 'integer', default: 0 })
  elapsedSeconds: number;

  @Column({ type: 'integer', default: 0 })
  movingSeconds: number;

  @Column({ type: 'real', default: 0 })
  gpsConfidence: number;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  verificationReasons: string[];

  @Column({ default: 'gps-v1' })
  algorithmVersion: string;

  @Column({ type: 'timestamptz' })
  startedAt: Date;

  @Column({ type: 'timestamptz' })
  finishedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
