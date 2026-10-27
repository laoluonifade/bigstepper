import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ select: false })
  passwordHash: string;

  @Column({ nullable: true })
  displayName: string;

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ type: 'varchar', length: 64, nullable: true, select: false })
  googleSub: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, select: false })
  appleSub: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true, select: false })
  appleRefreshToken: string | null;

  @Column({ default: 'runner' })
  role: 'runner' | 'admin' | 'compliance';

  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  suspendedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
