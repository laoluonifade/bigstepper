import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Activity } from '../running/activity.entity';
import { CompetitionTable } from './competition-table.entity';
import { TableRegistration } from './table-registration.entity';

@Entity('table_activity_credits')
@Unique(['tableId', 'activityId'])
@Index(['tableId', 'creditedDistanceMetres'])
export class TableActivityCredit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tableId: string;

  @ManyToOne(() => CompetitionTable, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tableId' })
  table: CompetitionTable;

  @Column()
  registrationId: string;

  @ManyToOne(() => TableRegistration, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'registrationId' })
  registration: TableRegistration;

  @Column()
  activityId: string;

  @ManyToOne(() => Activity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'activityId' })
  activity: Activity;

  @Column({ type: 'integer' })
  creditedDistanceMetres: number;

  @Column({ type: 'integer', default: 0 })
  creditedSteps: number;

  @Column({ type: 'integer', nullable: true })
  completionTimeSeconds: number | null;

  @CreateDateColumn()
  creditedAt: Date;
}
