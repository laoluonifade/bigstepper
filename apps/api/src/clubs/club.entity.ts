import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('clubs')
export class Club {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The handle in links (/clubs/lagos-road-runners). Fixed once created. */
  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @Column()
  ownerUserId: string;

  @Column({ type: 'varchar', length: 600, nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  logoUrl: string | null;

  /** The club's colour on its page and cards. */
  @Column({ type: 'varchar', length: 7, default: '#FF5A1F' })
  accentColor: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  location: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  website: string | null;

  /** Instagram handle without the @. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  instagram: string | null;

  /** open: anyone can join from the club page. invite: only with the invite link. */
  @Column({ type: 'varchar', length: 10, default: 'open' })
  privacy: 'open' | 'invite';

  /** In share links (?invite=CODE). Managers can reset it to cut off old links. */
  @Column({ type: 'varchar', length: 16, unique: true })
  inviteCode: string;

  /** Only the owner and managers can send in the club chat; members still read. */
  @Column({ default: false })
  chatLocked: boolean;

  /** Blue tick, set by a Jump admin. A badge only: unverified clubs work the same. */
  @Column({ type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
