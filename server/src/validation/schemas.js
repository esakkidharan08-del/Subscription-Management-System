import { z } from 'zod';

const id = z.number({ invalid_type_error: 'Choose a value' }).int().positive();
const text = (label) => z.string().trim().min(1, `${label} is required`);
const paise = z
  .number({ invalid_type_error: 'Enter an amount' })
  .int('Amounts must be whole paise')
  .nonnegative('Amounts cannot be negative');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date format YYYY-MM-DD');
const toNull = (schema) => schema.nullish().transform((value) => value ?? null);

export const SUBSCRIPTION_STATUSES = ['draft', 'quotation', 'confirmed', 'active', 'closed'];

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address');

export const passwordSchema = z
  .string()
  .min(9, 'Password must be longer than 8 characters')
  .regex(/[A-Z]/, 'Password needs an uppercase letter')
  .regex(/[a-z]/, 'Password needs a lowercase letter')
  .regex(/[^A-Za-z0-9]/, 'Password needs a special character');

export const signupSchema = z.object({
  name: text('Name'),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is missing'),
  password: passwordSchema,
});

export const productSchema = z.object({
  name: text('Name'),
  type: text('Type').default('service'),
  sales_price: paise,
  cost_price: paise.default(0),
  notes: toNull(z.string().trim()),
});

export const variantSchema = z.object({
  attribute: text('Attribute'),
  value: text('Value'),
  price_delta: z.number().int().default(0),
});

export const planSchema = z
  .object({
    product_id: id,
    name: text('Name'),
    price: paise,
    billing_period: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
    min_quantity: z.number().int().min(1, 'Minimum quantity must be at least 1').default(1),
    available_from: toNull(isoDate),
    available_to: toNull(isoDate),
    end_behavior: z.enum(['auto_close', 'manual_close', 'pausable', 'renewable']).default('renewable'),
  })
  .refine((plan) => !plan.available_from || !plan.available_to || plan.available_to >= plan.available_from, {
    message: 'Available to must be on or after available from',
    path: ['available_to'],
  });

export const taxSchema = z.object({
  name: text('Name'),
  rate_bp: z.number().int().min(0, 'Rate cannot be negative').max(10000, 'Rate cannot be above 100%'),
});

export const taxRuleSchema = z
  .object({
    tax_id: id,
    product_id: toNull(id),
    product_type: toNull(z.string().trim().min(1)),
    priority: z.number().int().default(0),
  })
  .refine((rule) => rule.product_id || rule.product_type, {
    message: 'Pick a product or a product type',
    path: ['product_id'],
  });

const lineSchema = z.object({
  product_id: id,
  quantity: z.number().int().positive('Quantity must be at least 1'),
  unit_price: paise.optional(),
  tax_id: toNull(id),
});

export const quotationTemplateSchema = z.object({
  name: text('Name'),
  plan_id: id,
  validity_days: z.number().int().positive().default(30),
  lines: z.array(lineSchema).default([]),
});

export const subscriptionSchema = z
  .object({
    customer_id: id,
    plan_id: id,
    start_date: isoDate,
    expiry_date: toNull(isoDate),
    payment_terms: z.number().int().min(0, 'Payment terms cannot be negative').default(15),
    lines: z.array(lineSchema).min(1, 'Add at least one product line'),
  })
  .refine((sub) => !sub.expiry_date || sub.expiry_date > sub.start_date, {
    message: 'Expiry date must be after the start date',
    path: ['expiry_date'],
  });

export const transitionSchema = z.object({ to: z.enum(SUBSCRIPTION_STATUSES) });

export const discountSchema = z
  .object({
    name: text('Name'),
    type: z.enum(['fixed', 'percent']),
    value: z.number().int().nonnegative('Value cannot be negative'),
    min_amount: paise.default(0),
    min_quantity: z.number().int().min(0).default(0),
    scope: z.enum(['product', 'subscription']),
    product_id: toNull(id),
    starts_at: toNull(isoDate),
    ends_at: toNull(isoDate),
    usage_limit: toNull(z.number().int().positive('Usage limit must be at least 1')),
    active: z.boolean().default(true),
  })
  .refine((d) => d.type !== 'percent' || d.value <= 100, {
    message: 'A percent discount cannot be above 100',
    path: ['value'],
  })
  .refine((d) => !d.starts_at || !d.ends_at || d.ends_at >= d.starts_at, {
    message: 'End date must be on or after the start date',
    path: ['ends_at'],
  })
  .refine((d) => d.scope !== 'product' || d.product_id, {
    message: 'Pick the product this discount applies to',
    path: ['product_id'],
  });

export const paymentSchema = z.object({
  method: z.enum(['cash', 'bank_transfer', 'card', 'upi', 'other']),
  amount: z.number().int().positive('Payment amount must be greater than zero'),
  paid_on: isoDate,
  note: toNull(z.string().trim()),
});

export const billingRunSchema = z.object({ date: isoDate.optional() });
