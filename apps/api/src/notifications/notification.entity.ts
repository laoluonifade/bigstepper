import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  type: string;

  @Column()
  title: string;

  @Column()
  body: string;

  @Column({ type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true, select: false })
  emailClaimedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true, select: false })
  emailProcessedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true, select: false })
  emailSentAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
