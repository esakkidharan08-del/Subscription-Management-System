import './setup-env.js';
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addMonths } from '../src/lib/dates.js';
import { bestDiscount, discountValue, isDiscountUsable } from '../src/services/discounts.js';
import { allocate, buildInvoice } from '../src/services/invoiceMath.js';
import { assertTransition, nextSubscriptionStatus } from '../src/services/lifecycle.js';
import { calculateTaxes, pickTaxRule } from '../src/services/tax.js';

const discount = (fields) => ({
  id: 1,
  active: 1,
  type: 'percent',
  value: 10,
  min_amount: 0,
  min_quantity: 0,
  scope: 'subscription',
  product_id: null,
  starts_at: null,
  ends_at: null,
  usage_limit: null,
  times_used: 0,
  ...fields,
});

describe('subscription lifecycle', () => {
  test('moves one step at a time from draft to closed', () => {
    assert.equal(nextSubscriptionStatus('draft'), 'quotation');
    assert.equal(nextSubscriptionStatus('active'), 'closed');
    assert.equal(nextSubscriptionStatus('closed'), null);
    assert.doesNotThrow(() => assertTransition('confirmed', 'active'));
  });

  test('rejects skipping a step or going back', () => {
    assert.throws(() => assertTransition('draft', 'active'), /cannot move to active/);
    assert.throws(() => assertTransition('active', 'draft'), /cannot move to draft/);
    assert.throws(() => assertTransition('closed', 'active'), /already closed/);
  });
});

describe('tax', () => {
  test('rounds once on the total, not on every line', () => {
    // 18% of 3 paise is 0.54, which rounds to 1 per line, but three lines are 1.62 in total.
    const lines = [3, 3, 3].map((amount) => ({ amount, rate_bp: 1800 }));
    const { lineTaxes, taxTotal } = calculateTaxes(lines);
    assert.deepEqual(lineTaxes, [1, 1, 1]);
    assert.equal(taxTotal, 2);
  });

  test('picks the highest priority rule, product rules winning ties', () => {
    const product = { id: 7, type: 'software' };
    const rules = [
      { id: 1, tax_id: 1, category: 'software', product_id: null, priority: 0 },
      { id: 2, tax_id: 2, category: null, product_id: 7, priority: 0 },
      { id: 3, tax_id: 3, category: 'software', product_id: null, priority: 5 },
    ];
    assert.equal(pickTaxRule(rules, product).id, 3);
    assert.equal(pickTaxRule(rules.slice(0, 2), product).id, 2);
    assert.equal(pickTaxRule(rules, { id: 8, type: 'goods' }), null);
  });
});

describe('discount rules', () => {
  test('checks active flag, dates and usage limit', () => {
    assert.equal(isDiscountUsable(discount({}), '2026-01-01'), true);
    assert.equal(isDiscountUsable(discount({ active: 0 }), '2026-01-01'), false);
    assert.equal(isDiscountUsable(discount({ starts_at: '2026-02-01' }), '2026-01-01'), false);
    assert.equal(isDiscountUsable(discount({ ends_at: '2025-12-31' }), '2026-01-01'), false);
    assert.equal(isDiscountUsable(discount({ usage_limit: 3, times_used: 3 }), '2026-01-01'), false);
  });

  test('a fixed discount never goes below zero', () => {
    assert.equal(discountValue(discount({ type: 'fixed', value: 5000 }), 3000), 3000);
    assert.equal(discountValue(discount({ type: 'percent', value: 15 }), 10000), 1500);
  });

  test('picks the single best discount that meets its minimums', () => {
    const candidates = [
      discount({ id: 1, type: 'percent', value: 10 }),
      discount({ id: 2, type: 'fixed', value: 5000, min_amount: 100000 }),
      discount({ id: 3, type: 'percent', value: 50, min_quantity: 10 }),
    ];
    assert.equal(bestDiscount(candidates, { amount: 40000, quantity: 1 }).discount.id, 1);
    assert.equal(bestDiscount(candidates, { amount: 40000, quantity: 10 }).discount.id, 3);
  });
});

describe('invoice maths', () => {
  test('allocation always adds back up to the amount', () => {
    const shares = allocate(100, [1, 1, 1]);
    assert.equal(shares.reduce((a, b) => a + b, 0), 100);
    assert.deepEqual(allocate(0, [5, 5]), [0, 0]);
  });

  test('product discount applies only to that product', () => {
    const lines = [
      { product_id: 1, description: 'A', quantity: 2, unit_price: 10000, rate_bp: 0 },
      { product_id: 2, description: 'B', quantity: 1, unit_price: 10000, rate_bp: 0 },
    ];
    const invoice = buildInvoice(
      lines,
      [discount({ scope: 'product', product_id: 1, type: 'percent', value: 50 })],
      '2026-01-01',
    );
    assert.equal(invoice.discount_total, 10000);
    assert.deepEqual(
      invoice.lines.map((line) => line.amount),
      [10000, 10000],
    );
  });

  test('total is subtotal minus discount plus tax', () => {
    const invoice = buildInvoice(
      [{ product_id: 1, description: 'A', quantity: 1, unit_price: 99999, rate_bp: 1800 }],
      [],
      '2026-01-01',
    );
    assert.equal(invoice.total, invoice.subtotal - invoice.discount_total + invoice.tax_total);
    assert.equal(invoice.tax_total, 18000);
  });
});

describe('dates', () => {
  test('month end billing does not drift into the next month', () => {
    assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
    assert.equal(addMonths('2026-03-31', 1), '2026-04-30');
  });
});
