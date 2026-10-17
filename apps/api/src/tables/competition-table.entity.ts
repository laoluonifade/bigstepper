import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../users/user.entity';

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
  scoringClosesAt: Date;

  @Column()
  creatorId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'creatorId' })
  creator: User;

  @CreateDateColumn()
  createdAt: Date;
}
