import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('apple_health_links')
export class AppleHealthLink {
  @PrimaryColumn('uuid')
  userId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  connectedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastSyncedAt: Date | null;
}
