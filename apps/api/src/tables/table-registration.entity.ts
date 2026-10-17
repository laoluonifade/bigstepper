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

  @CreateDateColumn()
  joinedAt: Date;
}
