import { z } from 'zod';
import { id, optionalDate, optionalText, paise, requiredText } from './common.js';

const variantSchema = z.object({
  attribute: requiredText('Attribute'),
  value: requiredText('Value'),
  // Variants can make a product cheaper, so negative deltas are allowed here.
  price_delta: z.number({ invalid_type_error: 'Enter an amount' }).int().default(0),
});

export const productSchema = z.object({
  name: requiredText('Name'),
  type: requiredText('Type').default('service'),
  sales_price: paise,
  cost_price: paise.default(0),
  notes: optionalText,
  variants: z
    .array(variantSchema)
    .default([])
    .refine(
      (variants) => new Set(variants.map((v) => `${v.attribute}=${v.value}`)).size === variants.length,
      'Each attribute and value pair can only appear once',
    ),
});

export const planSchema = z
  .object({
    product_id: id,
    name: requiredText('Name'),
    price: paise,
    billing_period: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
    min_quantity: z.number().int().min(1, 'Minimum quantity is at least 1').default(1),
    available_from: optionalDate,
    available_to: optionalDate,
    end_behavior: z.enum(['auto_close', 'manual_close', 'pausable', 'renewable']).default('renewable'),
  })
  .refine((plan) => !plan.available_from || !plan.available_to || plan.available_to >= plan.available_from, {
    message: 'End date must be on or after the start date',
    path: ['available_to'],
  });

export const taxSchema = z.object({
  name: requiredText('Name'),
  rate_bp: z
    .number({ invalid_type_error: 'Enter a rate' })
    .int()
    .min(0, 'Rate cannot be negative')
    .max(10000, 'Rate cannot be above 100%'),
});

export const taxRuleSchema = z
  .object({
    tax_id: id,
    product_id: id.nullish().transform((value) => value ?? null),
    category: optionalText,
    priority: z.number().int().default(0),
  })
  .refine((rule) => rule.product_id || rule.category, {
    message: 'Choose a product or enter a category',
    path: ['category'],
  });

export const quotationTemplateSchema = z.object({
  name: requiredText('Name'),
  plan_id: id,
  validity_days: z.number().int().positive('Validity must be at least one day').default(30),
  lines: z
    .array(
      z.object({
        product_id: id,
        quantity: z.number().int().positive('Quantity must be at least 1'),
      }),
    )
    .default([]),
});
