import assert from 'node:assert/strict';
import {
  computeMinimumPayment,
  computeSchedule,
  ValidationError
} from '../src/index.js';

function testThirtyYearMortgage() {
  const result = computeSchedule({
    principal: 300000,
    annualRatePercent: 6,
    monthlyPayment: 1798.65
  });

  assert.equal(result.exceededHorizon, false);
  assert.equal(result.termMonths, 360);
  assert.equal(result.schedule.at(-1).remainingBalance, 0);
}

function testRejectNonAmortizingPayment() {
  assert.throws(
    () =>
      computeSchedule({
        principal: 100000,
        annualRatePercent: 12,
        monthlyPayment: 1000
      }),
    (error) => error instanceof ValidationError
  );
}

function testHorizonCapTriggers() {
  const result = computeSchedule({
    principal: 100000000,
    annualRatePercent: 40,
    monthlyPayment: 3333333.34
  });

  assert.equal(result.exceededHorizon, true);
  assert.equal(result.termMonths, 1200);
  assert.notEqual(result.schedule.at(-1).remainingBalance, 0);
}

function testExactZeroNoFloatDrift() {
  const result = computeSchedule({
    principal: 1000,
    annualRatePercent: 0,
    monthlyPayment: 333.34
  });

  assert.equal(result.schedule.at(-1).remainingBalance, 0);
}

function testZeroAprEdgeCase() {
  const result = computeSchedule({
    principal: 1200,
    annualRatePercent: 0,
    monthlyPayment: 100
  });

  assert.equal(result.termMonths, 12);
  assert.equal(result.totals.totalInterest, 0);
  assert.equal(computeMinimumPayment(1200, 0), 0.01);
}

testThirtyYearMortgage();
testRejectNonAmortizingPayment();
testHorizonCapTriggers();
testExactZeroNoFloatDrift();
testZeroAprEdgeCase();

console.log('calc-engine tests passed');
