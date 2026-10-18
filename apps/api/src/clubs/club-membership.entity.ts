import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('club_memberships')
@Unique(['clubId', 'userId'])
export class ClubMembership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  clubId: string;

  @Column()
  userId: string;

  @Column({ default: 'member' })
  role: 'owner' | 'admin' | 'member';

  @CreateDateColumn()
  joinedAt: Date;
}
