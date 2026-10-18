import { IsInt, Max, Min } from 'class-validator';

export class FundWalletDto {
  @IsInt() @Min(10000) @Max(100000000)
  amountKobo: number;
}
