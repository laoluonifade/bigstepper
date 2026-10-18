import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../users/user.entity';

@Entity('running_sessions')
export class RunningSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ default: 'IDLE' })
  status: string;

  @Column({ default: 'run' })
  activityType: 'walk' | 'run';

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt: Date;

  @Column({ type: 'integer', default: 0 })
  distanceMetres: number;

  @Column({ type: 'integer', default: 0 })
  stepCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  pausedAt: Date | null;

  @Column({ type: 'integer', default: 0 })
  pausedSeconds: number;

  @CreateDateColumn()
  createdAt: Date;
}
