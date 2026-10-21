import { BadRequestException } from '@nestjs/common';

export function reminderConfig(time?: string, timeZone?: string) {
  if (!time && !timeZone) return { reminderTime: null, reminderTimeZone: null };
  if (!time || !timeZone) throw new BadRequestException('Choose both a reminder time and time zone');
  try { new Intl.DateTimeFormat('en', { timeZone }); }
  catch { throw new BadRequestException('Invalid reminder time zone'); }
  return { reminderTime: time, reminderTimeZone: timeZone };
}
