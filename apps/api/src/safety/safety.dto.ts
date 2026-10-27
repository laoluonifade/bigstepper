import { IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { REPORT_REASONS, REPORT_TARGETS, ReportReason, ReportTarget } from './safety.sql';

export class CreateReportDto {
  @IsIn(REPORT_TARGETS) targetType: ReportTarget;
  @IsString() @MaxLength(64) target: string;
  @IsIn(REPORT_REASONS) reason: ReportReason;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ResolveReportDto {
  @IsIn(['dismiss', 'remove', 'suspend']) action: 'dismiss' | 'remove' | 'suspend';
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class LiftSuspensionDto {
  @IsUUID() userId: string;
  @IsString() @Length(3, 300) reason: string;
}
