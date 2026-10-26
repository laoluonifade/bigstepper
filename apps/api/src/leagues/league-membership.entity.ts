import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('league_memberships')
@Unique(['seasonId', 'userId'])
export class LeagueMembership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  seasonId: string;

  @Column()
  divisionId: string;

  @Column()
  userId: string;

  @Column({ type: 'integer', default: 0 })
  creditedDistanceMetres: number;

  @Column({ type: 'integer', nullable: true })
  finalRank: number | null;

  @Column({ type: 'varchar', nullable: true })
  outcome: 'PROMOTED' | 'RELEGATED' | 'STAYED' | null;
}
