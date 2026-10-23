import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique, CreateDateColumn } from 'typeorm';
import { CompetitionTable } from './competition-table.entity';
import { User } from '../users/user.entity';

@Entity('table_registrations')
@Unique(['tableId', 'userId'])
export class TableRegistration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tableId: string;

  @ManyToOne(() => CompetitionTable)
  @JoinColumn({ name: 'tableId' })
  table: CompetitionTable;

  @Column()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'integer', default: 0 })
  creditedDistanceMetres: number;

  @Column({ type: 'integer', default: 0 })
  creditedSteps: number;

  @Column({ type: 'integer', nullable: true })
  completionTimeSeconds: number | null;

  /** Set by the scoring engine: the score in the metric's unit, and a bigger-is-better copy to rank by. */
  @Column({ type: 'double precision', nullable: true })
  score: number | null;

  @Column({ type: 'double precision', nullable: true })
  rankScore: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  targetReachedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  scoredAt: Date | null;

  @Column({ default: true })
  qualified: boolean;

  @Column({ type: 'uuid', nullable: true, unique: true })
  paymentIntentId: string | null;

  @CreateDateColumn()
  joinedAt: Date;
}
