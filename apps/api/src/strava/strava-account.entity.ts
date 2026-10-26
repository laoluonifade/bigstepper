import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../users/user.entity';

@Entity('strava_accounts')
export class StravaAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true, unique: true })
  userId: string | null;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'bigint', unique: true })
  athleteId: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  athleteName: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'varchar', length: 200, select: false })
  accessToken: string;

  @Column({ type: 'varchar', length: 200, select: false })
  refreshToken: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'varchar', length: 200, default: '' })
  scope: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastSyncedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
