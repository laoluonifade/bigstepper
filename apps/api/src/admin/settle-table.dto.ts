import { IsUUID } from 'class-validator';

export class SettleTableDto {
  @IsUUID()
  tableId: string;
}
