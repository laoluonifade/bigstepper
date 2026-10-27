export const REPORT_TARGETS = ['rant', 'comment', 'message', 'profile'] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const REPORT_REASONS = ['harassment', 'spam', 'inappropriate', 'cheating', 'impersonation', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const blockedBetween = (a: string, b: string) =>
  `EXISTS (SELECT 1 FROM "user_blocks" ub WHERE (ub."blockerId"=${a} AND ub."blockedId"=${b}) OR (ub."blockerId"=${b} AND ub."blockedId"=${a}))`;

export const blockedBy = (blocker: string, blocked: string) =>
  `EXISTS (SELECT 1 FROM "user_blocks" ub WHERE ub."blockerId"=${blocker} AND ub."blockedId"=${blocked})`;

export const reportedBy = (reporter: string, type: ReportTarget, target: string) =>
  `EXISTS (SELECT 1 FROM "content_reports" cr WHERE cr."reporterId"=${reporter} AND cr."targetType"='${type}' AND cr."targetId"=${target})`;
