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

  @Column()
  displayName: string;

  @Column({ default: 'km' })
  preferredUnit: 'km' | 'mi';

  @Column({ length: 2, default: 'NG' })
  countryCode: string;

  /** Private preference used to choose a default avatar; never shown on public profiles. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  gender: 'male' | 'female' | 'non_binary' | 'prefer_not_to_say' | null;

  /** Cloudinary delivery URL (already face-cropped to a square). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  bio: string | null;

  @Column({ type: 'integer', nullable: true })
  weeklyGoalMetres: number | null;

  /** Private; used only for an optional activity calorie estimate. */
  @Column({ type: 'real', nullable: true })
  weightKg: number | null;

  @Column({ default: true })
  emailActivityEnabled: boolean;

  /** Private contact number in international format; never on public profiles. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  whatsappNumber: string | null;

  /** Lagos date of the last "keep your streak alive" email, so it goes out at most once a day. */
  @Column({ type: 'date', nullable: true })
  streakReminderSentOn: string | null;

  @Column({ default: true })
  emailDigestEnabled: boolean;

  @Column({ type: 'timestamptz', default: () => "now() + interval '3 days'", select: false })
  digestNextAt: Date;

  @Column({ type: 'timestamptz', nullable: true, select: false })
  digestClaimedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
