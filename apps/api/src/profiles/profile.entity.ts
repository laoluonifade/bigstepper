import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../users/user.entity';

@Entity('profiles')
export class Profile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ unique: true })
  username: string;

  @Column({ default: false })
  usernameChosen: boolean;

  @Column()
  displayName: string;

  @Column({ default: 'km' })
  preferredUnit: 'km' | 'mi';

  @Column({ type: 'varchar', length: 12, default: 'all' })
  exploreLens: 'all' | 'events' | 'competitions';

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  interests: string[];

  @Column({ length: 2, default: 'NG' })
  countryCode: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender: 'male' | 'female' | 'non_binary' | 'prefer_not_to_say' | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  bio: string | null;

  @Column({ type: 'integer', nullable: true })
  weeklyGoalMetres: number | null;

  @Column({ type: 'real', nullable: true })
  weightKg: number | null;

  @Column({ default: true })
  emailActivityEnabled: boolean;

  @Column({ type: 'varchar', length: 12, default: 'everyone' })
  messagesFrom: 'everyone' | 'following';

  @Column({ type: 'varchar', length: 20, nullable: true })
  whatsappNumber: string | null;

  @Column({ type: 'date', nullable: true })
  streakReminderSentOn: string | null;

  @Column({ default: true })
  emailDigestEnabled: boolean;

  @Column({ type: 'timestamptz', default: () => "now() + interval '3 days'", select: false })
  digestNextAt: Date;

  @Column({ type: 'timestamptz', nullable: true, select: false })
  digestClaimedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
