import { z } from 'zod';

export const id = z
  .number({ required_error: 'Required', invalid_type_error: 'Pick an option' })
  .int()
  .positive('Pick an option');

export const paise = z
  .number({ required_error: 'Required', invalid_type_error: 'Enter an amount' })
  .int('Amount must be in whole paise')
  .min(0, 'Amount cannot be negative');

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');

export const optionalDate = isoDate.nullish().transform((value) => value ?? null);

export const optionalText = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value || null);

export const requiredText = (label) => z.string().trim().min(1, `${label} is required`).max(200);
