import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('apple_health_links')
export class AppleHealthLink {
  @PrimaryColumn('uuid')
  userId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  connectedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastSyncedAt: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  timeZone: string | null;

  @Column({ type: 'boolean', default: true })
  shareSteps: boolean;
}
