import { z } from 'zod';
import { today } from '../lib/dates.js';
import { SUBSCRIPTION_FLOW } from '../services/lifecycle.js';
import { id, isoDate, optionalDate, optionalText, paise, requiredText } from './common.js';

export const PAYMENT_TERMS = ['immediate', 'net_15', 'net_30'];

const subscriptionLine = z.object({
  product_id: id,
  quantity: z
    .number({ invalid_type_error: 'Enter a quantity' })
    .int()
    .positive('Quantity must be at least 1'),
  unit_price: paise.optional(),
  variant_id: id.nullish().transform((value) => value ?? null),
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

export const addonSchema = z.object({
  product_id: id,
  variant_id: id.nullish().transform((value) => value ?? null),
  quantity: z.number().int().positive('Quantity must be at least 1').default(1),
});

export const statusChangeSchema = z.object({
  status: z.enum(SUBSCRIPTION_FLOW),
});

export const invoiceEditSchema = z.object({
  due_date: isoDate.optional(),
  lines: z
    .array(
      z.object({
        id,
        description: requiredText('Description').optional(),
        quantity: z.number().int().positive('Quantity must be at least 1').optional(),
        unit_price: paise.optional(),
      }),
    )
    .default([]),
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

export { discountSchema } from 'shared/validation/discount.js';
