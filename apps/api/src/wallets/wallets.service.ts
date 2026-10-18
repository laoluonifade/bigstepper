import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class WalletsService {
  constructor(private readonly dataSource: DataSource) {}

  async get(userId: string) {
    const rows = await this.dataSource.query(
      `INSERT INTO "wallets" ("userId") VALUES ($1) ON CONFLICT ("userId") DO UPDATE SET "userId"=EXCLUDED."userId"
       RETURNING "id","balanceKobo","currency","createdAt","updatedAt"`,
      [userId],
    ) as Array<Record<string, unknown>>;
    return { ...rows[0], withdrawable: false };
  }

  transactions(userId: string) {
    return this.dataSource.query(
      `SELECT t."id",t."type",t."amountKobo",t."balanceAfterKobo",t."reference",t."description",t."createdAt"
       FROM "wallet_transactions" t JOIN "wallets" w ON w."id"=t."walletId"
       WHERE w."userId"=$1 ORDER BY t."createdAt" DESC LIMIT 100`,
      [userId],
    );
  }
}
