import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) userId: string;
  @Column({ type: 'bigint', transformer: { to: (value: number) => value, from: (value: string) => Number(value) }, default: 0 }) balanceKobo: number;
  @Column({ length: 3, default: 'NGN' }) currency: string;
  @Column({ type: 'timestamptz', nullable: true }) frozenAt: Date | null;
  @Column({ type: 'varchar', nullable: true }) freezeReason: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
