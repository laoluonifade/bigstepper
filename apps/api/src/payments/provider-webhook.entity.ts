import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('provider_webhook_inbox')
@Unique(['provider', 'dedupeKey'])
export class ProviderWebhook {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() provider: string;
  @Column() dedupeKey: string;
  @Column() eventType: string;
  @Column({ type: 'jsonb' }) payload: Record<string, unknown>;
  @Column({ type: 'timestamptz', nullable: true }) processedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
}
