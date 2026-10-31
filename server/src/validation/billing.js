import { z } from 'zod';
import { today } from '../lib/dates.js';
import { SUBSCRIPTION_FLOW } from '../services/lifecycle.js';
import { id, isoDate, optionalDate, optionalText, paise, requiredText } from './common.js';

export const PAYMENT_TERMS = ['immediate', 'net_15', 'net_30'];

const subscriptionLine = z.object({
  product_id: id,
  quantity: z.number({ invalid_type_error: 'Enter a quantity' }).int().positive('Quantity must be at least 1'),
  unit_price: paise.optional(),
});

const expiryAfterStart = [
  (s) => !s.expiry_date || s.expiry_date > s.start_date,
  { message: 'Expiry date must be after the start date', path: ['expiry_date'] },
];

export const subscriptionSchema = z
  .object({
    customer_id: id,
    plan_id: id,
    start_date: isoDate,
    expiry_date: optionalDate,
    payment_terms: z.enum(PAYMENT_TERMS).default('immediate'),
    lines: z.array(subscriptionLine).default([]),
  })
  .refine(...expiryAfterStart);

export const subscriptionFromTemplateSchema = z
  .object({
    template_id: id,
    customer_id: id,
    start_date: isoDate,
    expiry_date: optionalDate,
    payment_terms: z.enum(PAYMENT_TERMS).default('immediate'),
  })
  .refine(...expiryAfterStart);

export const statusChangeSchema = z.object({
  status: z.enum(SUBSCRIPTION_FLOW),
});

export const billingRunSchema = z.object({
  as_of: isoDate.optional(),
});

export const paymentSchema = z.object({
  method: z.enum(['cash', 'card', 'bank_transfer', 'upi']),
  amount: z
    .number({ invalid_type_error: 'Enter an amount' })
    .int('Amount must be in whole paise')
    .positive('Amount must be more than zero'),
  paid_on: isoDate.default(() => today()),
  note: optionalText,
});

export const discountSchema = z
  .object({
    name: requiredText('Name'),
    type: z.enum(['fixed', 'percent']),
    // Paise for a fixed discount, whole percent for a percent discount.
    value: z.number({ invalid_type_error: 'Enter a value' }).int().min(0, 'Value cannot be negative'),
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
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'A percent discount cannot be above 100' });
    }
    if (discount.starts_at && discount.ends_at && discount.ends_at < discount.starts_at) {
      ctx.addIssue({ code: 'custom', path: ['ends_at'], message: 'End date must be on or after the start date' });
    }
    if (discount.scope === 'product' && !discount.product_id) {
      ctx.addIssue({ code: 'custom', path: ['product_id'], message: 'Pick the product this discount is for' });
    }
  });
