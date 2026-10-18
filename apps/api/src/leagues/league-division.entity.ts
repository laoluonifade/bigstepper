import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('league_divisions')
export class LeagueDivision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ unique: true })
  level: number;
}
