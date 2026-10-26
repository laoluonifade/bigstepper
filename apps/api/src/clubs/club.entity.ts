import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('clubs')
export class Club {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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

  @Column({ type: 'varchar', length: 7, default: '#FF5A1F' })
  accentColor: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  location: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  website: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  instagram: string | null;

  @Column({ type: 'varchar', length: 10, default: 'open' })
  privacy: 'open' | 'invite';

  @Column({ type: 'varchar', length: 16, unique: true })
  inviteCode: string;

  @Column({ default: false })
  chatLocked: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @Column({ type: 'varchar', length: 12, default: 'free' })
  plan: 'free' | 'pro';

  @Column({ type: 'timestamptz', nullable: true })
  planRenewsAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  suspendedAt: Date | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  suspendedReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
