import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('league_seasons')
export class LeagueSeason {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @Column({ type: 'timestamptz' })
  endsAt: Date;

  @Column({ default: 'ACTIVE' })
  status: 'SCHEDULED' | 'ACTIVE' | 'FINALIZED';
}
