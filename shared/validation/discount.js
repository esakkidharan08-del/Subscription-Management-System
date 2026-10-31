import { z } from 'zod';
import { id, optionalDate, paise, requiredText } from './common.js';

export const discountSchema = z
  .object({
    name: requiredText('Name'),
    type: z.enum(['fixed', 'percent']),
    // Paise for a fixed discount, whole percent for a percent discount.
    value: z
      .number({ invalid_type_error: 'Enter a value' })
      .int()
      .min(0, 'Value cannot be negative'),
    min_amount: paise.default(0),
    min_quantity: z.number().int().min(0, 'Minimum quantity cannot be negative').default(0),
    scope: z.enum(['product', 'subscription']),
    product_id: id.nullish().transform((value) => value ?? null),
    starts_at: optionalDate,
    ends_at: optionalDate,
    usage_limit: z
      .number()
      .int()
      .positive('Usage limit must be at least 1')
      .nullish()
      .transform((value) => value ?? null),
    active: z.boolean().default(true),
  })
  .superRefine((discount, ctx) => {
    if (discount.type === 'percent' && discount.value > 100) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'A percent discount cannot be above 100',
      });
    }
    if (discount.starts_at && discount.ends_at && discount.ends_at < discount.starts_at) {
      ctx.addIssue({
        code: 'custom',
        path: ['ends_at'],
        message: 'End date must be on or after the start date',
      });
    }
    if (discount.scope === 'product' && !discount.product_id) {
      ctx.addIssue({
        code: 'custom',
        path: ['product_id'],
        message: 'Pick the product this discount is for',
      });
    }
  });
