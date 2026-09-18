import cors from 'cors';
import express from 'express';
import {
  computeInputLimits,
  computeSchedule,
  scheduleToCsv,
  validateInputs,
  ValidationError
} from '@loanscope/calc-engine';

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sendValidationError(response, error) {
  const message =
    error instanceof ValidationError
      ? error.message
      : 'Invalid request. Please check your inputs.';
  response.status(400).json({ error: { message } });
}

app.post('/api/validate', (request, response) => {
  try {
    const principal = parseNumber(request.body?.principal);
    const annualRatePercent = parseNumber(request.body?.annualRatePercent);
    const monthlyPayment = parseNumber(request.body?.monthlyPayment);

    validateInputs({ principal, annualRatePercent, monthlyPayment });
    const limits = computeInputLimits(principal, annualRatePercent);
    response.json({ valid: true, limits });
  } catch (error) {
    sendValidationError(response, error);
  }
});

app.post('/api/schedule', (request, response) => {
  try {
    const principal = parseNumber(request.body?.principal);
    const annualRatePercent = parseNumber(request.body?.annualRatePercent);
    const monthlyPayment = parseNumber(request.body?.monthlyPayment);

    const result = computeSchedule({ principal, annualRatePercent, monthlyPayment });
    response.json(result);
  } catch (error) {
    sendValidationError(response, error);
  }
});

app.get('/api/limits', (request, response) => {
  try {
    const principal = parseNumber(request.query.principal);
    const annualRatePercent = parseNumber(request.query.rate);

    const limits = computeInputLimits(principal, annualRatePercent);
    response.json(limits);
  } catch (error) {
    sendValidationError(response, error);
  }
});

app.get('/api/schedule/csv', (request, response) => {
  try {
    const principal = parseNumber(request.query.principal);
    const annualRatePercent = parseNumber(request.query.rate);
    const monthlyPayment = parseNumber(request.query.payment);

    const result = computeSchedule({ principal, annualRatePercent, monthlyPayment });
    const csv = scheduleToCsv(result);

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="loanscope-schedule.csv"');
    response.send(csv);
  } catch (error) {
    sendValidationError(response, error);
  }
});

app.use((error, _request, response, _next) => {
  if (error instanceof SyntaxError) {
    return response.status(400).json({ error: { message: 'Malformed JSON request body.' } });
  }

  return response.status(500).json({
    error: { message: 'Unexpected server error. Please try again.' }
  });
});

app.listen(port, () => {
  console.log(`LoanScope backend listening on port ${port}`);
});
