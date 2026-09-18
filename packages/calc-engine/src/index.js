const MAX_MONTHS = 1200;
const MIN_PRINCIPAL_DOLLARS = 1;
const MAX_PRINCIPAL_DOLLARS = 100_000_000;
const MIN_ANNUAL_RATE_PERCENT = 0;
const MAX_ANNUAL_RATE_PERCENT = 40;
const MIN_MONTHLY_PAYMENT_DOLLARS = 1;
const BASE_MAX_MONTHLY_PAYMENT_DOLLARS = 1_000_000;

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

function toCents(amount, fieldName) {
  if (!Number.isFinite(amount)) {
    throw new ValidationError(`${fieldName} must be a finite number.`);
  }
  return Math.round(amount * 100);
}

function centsToDollars(cents) {
  return Number((cents / 100).toFixed(2));
}

function validateRateIncrement(annualRatePercent) {
  const basisPoints = annualRatePercent * 100;
  if (Math.abs(Math.round(basisPoints) - basisPoints) > 1e-8) {
    throw new ValidationError('Annual rate must be in 0.01% increments.');
  }
}

function computeMonthlyInterestCents(balanceCents, annualRatePercent) {
  return Math.round((balanceCents * annualRatePercent) / 1200);
}

function computeMinimumPaymentCentsInternal(principalCents, annualRatePercent) {
  return computeMonthlyInterestCents(principalCents, annualRatePercent) + 1;
}

export function computeMinimumPayment(principal, annualRatePercent) {
  const { principalCents, annualRatePercent: normalizedRate } = validateInputs(
    { principal, annualRatePercent },
    { allowMissingPayment: true }
  );

  return centsToDollars(
    computeMinimumPaymentCentsInternal(principalCents, normalizedRate)
  );
}

export function computeInputLimits(principal, annualRatePercent) {
  const { principalCents, annualRatePercent: normalizedRate } = validateInputs(
    { principal, annualRatePercent },
    { allowMissingPayment: true }
  );

  const minimumAmortizingPaymentCents = computeMinimumPaymentCentsInternal(
    principalCents,
    normalizedRate
  );
  const maxMonthlyPaymentDollars = Math.max(
    BASE_MAX_MONTHLY_PAYMENT_DOLLARS,
    centsToDollars(minimumAmortizingPaymentCents * 3)
  );

  return {
    principal: {
      min: MIN_PRINCIPAL_DOLLARS,
      max: MAX_PRINCIPAL_DOLLARS
    },
    annualRatePercent: {
      min: MIN_ANNUAL_RATE_PERCENT,
      max: MAX_ANNUAL_RATE_PERCENT,
      step: 0.01
    },
    monthlyPayment: {
      min: MIN_MONTHLY_PAYMENT_DOLLARS,
      max: maxMonthlyPaymentDollars
    },
    minimumAmortizingPayment: centsToDollars(minimumAmortizingPaymentCents),
    maxMonths: MAX_MONTHS
  };
}

export function validateInputs(
  { principal, annualRatePercent, monthlyPayment },
  { allowMissingPayment = false } = {}
) {
  if (!Number.isFinite(principal)) {
    throw new ValidationError('Principal must be a finite number.');
  }
  if (!Number.isFinite(annualRatePercent)) {
    throw new ValidationError('Annual rate must be a finite number.');
  }

  if (
    principal < MIN_PRINCIPAL_DOLLARS ||
    principal > MAX_PRINCIPAL_DOLLARS
  ) {
    throw new ValidationError(
      `Principal must be between $${MIN_PRINCIPAL_DOLLARS.toLocaleString()} and $${MAX_PRINCIPAL_DOLLARS.toLocaleString()}.`
    );
  }

  if (
    annualRatePercent < MIN_ANNUAL_RATE_PERCENT ||
    annualRatePercent > MAX_ANNUAL_RATE_PERCENT
  ) {
    throw new ValidationError(
      `Annual rate must be between ${MIN_ANNUAL_RATE_PERCENT}% and ${MAX_ANNUAL_RATE_PERCENT}%.`
    );
  }

  validateRateIncrement(annualRatePercent);

  const principalCents = toCents(principal, 'Principal');
  const minimumAmortizingPaymentCents = computeMinimumPaymentCentsInternal(
    principalCents,
    annualRatePercent
  );

  const maxMonthlyPaymentDollars = Math.max(
    BASE_MAX_MONTHLY_PAYMENT_DOLLARS,
    centsToDollars(minimumAmortizingPaymentCents * 3)
  );

  if (allowMissingPayment && monthlyPayment === undefined) {
    return {
      principal,
      annualRatePercent,
      principalCents
    };
  }

  if (!Number.isFinite(monthlyPayment)) {
    throw new ValidationError('Monthly payment must be a finite number.');
  }

  if (
    monthlyPayment < MIN_MONTHLY_PAYMENT_DOLLARS ||
    monthlyPayment > maxMonthlyPaymentDollars
  ) {
    throw new ValidationError(
      `Monthly payment must be between $${MIN_MONTHLY_PAYMENT_DOLLARS.toLocaleString()} and $${maxMonthlyPaymentDollars.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}.`
    );
  }

  const monthlyPaymentCents = toCents(monthlyPayment, 'Monthly payment');
  const firstMonthInterestCents = computeMonthlyInterestCents(
    principalCents,
    annualRatePercent
  );

  if (monthlyPaymentCents <= firstMonthInterestCents) {
    throw new ValidationError(
      `Monthly payment must be greater than first-month interest ($${centsToDollars(firstMonthInterestCents).toFixed(2)}).`
    );
  }

  return {
    principal,
    annualRatePercent,
    monthlyPayment,
    principalCents,
    monthlyPaymentCents
  };
}

function addMonths(baseDate, months) {
  const date = new Date(baseDate);
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  return date;
}

export function computeSchedule({
  principal,
  annualRatePercent,
  monthlyPayment,
  startDate = new Date()
}) {
  const {
    principalCents,
    monthlyPaymentCents,
    annualRatePercent: normalizedRate
  } = validateInputs({ principal, annualRatePercent, monthlyPayment });

  let balanceCents = principalCents;
  let cumulativeInterestCents = 0;
  let cumulativePrincipalCents = 0;

  const schedule = [];

  for (let month = 1; month <= MAX_MONTHS && balanceCents > 0; month += 1) {
    const interestCents = computeMonthlyInterestCents(balanceCents, normalizedRate);

    if (monthlyPaymentCents <= interestCents) {
      throw new ValidationError(
        `Monthly payment must exceed monthly interest (${centsToDollars(interestCents).toFixed(2)}) to amortize.`
      );
    }

    const principalPortionCents = Math.min(
      monthlyPaymentCents - interestCents,
      balanceCents
    );
    const actualPaymentCents = principalPortionCents + interestCents;

    balanceCents -= principalPortionCents;
    cumulativeInterestCents += interestCents;
    cumulativePrincipalCents += principalPortionCents;

    schedule.push({
      month,
      payment: centsToDollars(actualPaymentCents),
      principalPortion: centsToDollars(principalPortionCents),
      interestPortion: centsToDollars(interestCents),
      remainingBalance: centsToDollars(balanceCents),
      cumulativeInterest: centsToDollars(cumulativeInterestCents),
      cumulativePrincipal: centsToDollars(cumulativePrincipalCents)
    });
  }

  const exceededHorizon = balanceCents > 0;
  const termMonths = schedule.length;
  const payoffDate = exceededHorizon
    ? null
    : addMonths(startDate, termMonths).toISOString();

  return {
    input: {
      principal,
      annualRatePercent,
      monthlyPayment
    },
    schedule,
    exceededHorizon,
    termMonths,
    termYears: Math.floor(termMonths / 12),
    termRemainingMonths: termMonths % 12,
    payoffDate,
    totals: {
      totalPrincipal: centsToDollars(cumulativePrincipalCents),
      totalInterest: centsToDollars(cumulativeInterestCents),
      totalPaid: centsToDollars(cumulativePrincipalCents + cumulativeInterestCents)
    }
  };
}

export function scheduleToCsv(result) {
  const headers = [
    'Month',
    'Payment',
    'Principal Portion',
    'Interest Portion',
    'Remaining Balance',
    'Cumulative Interest',
    'Cumulative Principal'
  ];

  const rows = result.schedule.map((row) => [
    row.month,
    row.payment.toFixed(2),
    row.principalPortion.toFixed(2),
    row.interestPortion.toFixed(2),
    row.remainingBalance.toFixed(2),
    row.cumulativeInterest.toFixed(2),
    row.cumulativePrincipal.toFixed(2)
  ]);

  return [headers, ...rows].map((row) => row.join(',')).join('\n');
}

export const ENGINE_LIMITS = {
  maxMonths: MAX_MONTHS,
  principal: {
    min: MIN_PRINCIPAL_DOLLARS,
    max: MAX_PRINCIPAL_DOLLARS
  },
  annualRatePercent: {
    min: MIN_ANNUAL_RATE_PERCENT,
    max: MAX_ANNUAL_RATE_PERCENT,
    step: 0.01
  },
  monthlyPayment: {
    min: MIN_MONTHLY_PAYMENT_DOLLARS,
    maxBase: BASE_MAX_MONTHLY_PAYMENT_DOLLARS
  }
};
