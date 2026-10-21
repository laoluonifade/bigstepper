import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('payment_intents')
@Index(['userId', 'tableId'])
export class PaymentIntent {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() userId: string;
  @Column({ type: 'uuid', nullable: true }) tableId: string | null;
  @Column({ default: 'CHALLENGE_ENTRY' }) purpose: 'CHALLENGE_ENTRY' | 'WALLET_FUNDING' | 'SPONSOR_FUNDING';
  @Column({ unique: true }) reference: string;
  @Column({ type: 'bigint', transformer: { to: (value: number) => value, from: (value: string) => Number(value) } }) amountKobo: number;
  @Column({ length: 3, default: 'NGN' }) currency: string;
  @Column({ default: 'INITIATED' }) status: string;
  @Column({ type: 'varchar', nullable: true }) providerStatus: string | null;
  @Column({ type: 'varchar', nullable: true, unique: true }) providerTransactionId: string | null;
  @Column({ type: 'timestamptz' }) expiresAt: Date;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
