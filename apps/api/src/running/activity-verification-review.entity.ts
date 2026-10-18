import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { Activity } from './activity.entity';

@Entity('activity_verification_reviews')
export class ActivityVerificationReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  activityId: string;

  @ManyToOne(() => Activity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'activityId' })
  activity: Activity;

  @Column()
  requestedByUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  requestedBy: User;

  @Column({ default: 'PENDING' })
  status: 'PENDING' | 'APPROVED' | 'REJECTED';

  @Column({ type: 'varchar', length: 500 })
  reason: string;

  @CreateDateColumn()
  createdAt: Date;
}
