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

  @Column({ default: 'private' })
  activityVisibility: 'private' | 'followers' | 'public';

  @Column({ length: 2, default: 'NG' })
  countryCode: string;

  /** Cloudinary delivery URL (already face-cropped to a square). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  bio: string | null;

  @Column({ type: 'integer', nullable: true })
  weeklyGoalMetres: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
