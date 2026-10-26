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

  /** The Google account's id once the runner has used "Continue with Google". */
  @Column({ type: 'varchar', length: 64, nullable: true, select: false })
  googleSub: string | null;

  /** Apple's id for the runner once they've used "Sign in with Apple". */
  @Column({ type: 'varchar', length: 64, nullable: true, select: false })
  appleSub: string | null;

  /** Kept only so deleting the account can revoke Jump's access at Apple. */
  @Column({ type: 'varchar', length: 512, nullable: true, select: false })
  appleRefreshToken: string | null;

  @Column({ default: 'runner' })
  role: 'runner' | 'admin' | 'compliance';

  /** Last signed-in request, kept to the nearest five minutes. */
  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
