import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';

@Entity('auth_sessions')
@Index(['userId', 'revokedAt'])
export class AuthSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  /** app: the runner app. admin: admin.startajump.com, signed in with an emailed code. */
  @Column({ type: 'varchar', length: 10, default: 'app' })
  scope: 'app' | 'admin';

  @CreateDateColumn()
  createdAt: Date;
}
