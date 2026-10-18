import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { RunningSession } from './running-session.entity';

@Entity('gps_samples')
@Index(['sessionId', 'sequence'], { unique: true })
export class GpsSample {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sessionId: string;

  @ManyToOne(() => RunningSession)
  @JoinColumn({ name: 'sessionId' })
  session: RunningSession;

  @Column({ type: 'integer' })
  sequence: number;

  @Column({ type: 'double precision' })
  latitude: number;

  @Column({ type: 'double precision' })
  longitude: number;

  @Column({ type: 'double precision', nullable: true })
  accuracy: number;

  @Column({ type: 'integer', nullable: true })
  stepCount: number | null;

  @Column({ type: 'timestamptz' })
  recordedAt: Date;
}
