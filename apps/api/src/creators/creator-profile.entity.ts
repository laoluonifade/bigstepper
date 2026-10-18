import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../users/user.entity';

@Entity('creator_profiles')
export class CreatorProfile {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) userId: string;
  @OneToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'userId' }) user: User;
  @Column() creatorType: 'influencer' | 'community_manager' | 'run_club' | 'other';
  @Column() displayName: string;
  @Column({ type: 'varchar', nullable: true }) socialUrl: string | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) bio: string | null;
  @Column({ default: 'ACTIVE' }) status: 'ACTIVE' | 'SUSPENDED';
  @Column({ type: 'integer', default: 500 }) commissionBps: number;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
