import { MigrationInterface, QueryRunner } from 'typeorm';
export class OrganicAcquisition1793550000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE organic_acquisition_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,session uuid NOT NULL,source varchar(20) NOT NULL,
  landing varchar(240) NOT NULL,kind varchar(40) NOT NULL,"dedupeKey" text NOT NULL UNIQUE,"createdAt" timestamptz NOT NULL DEFAULT now())`);
    await q.query(
      `CREATE INDEX organic_acquisition_time ON organic_acquisition_events("createdAt",kind,source)`,
    );
  }
  async down(q: QueryRunner) {
    await q.query('DROP TABLE organic_acquisition_events');
  }
}
