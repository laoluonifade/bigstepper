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
