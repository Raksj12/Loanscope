import { useEffect, useMemo, useRef, useState } from 'react';
import {
  computeInputLimits,
  computeSchedule,
  scheduleToCsv
} from '@loanscope/calc-engine';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

const DEFAULTS = {
  principal: 300000,
  annualRatePercent: 6,
  monthlyPayment: 1798.65
};

const ROWS_PER_PAGE = 50;

function parseInitialScenario() {
  const params = new URLSearchParams(window.location.search);
  const notices = [];

  const principalRaw = params.get('principal');
  const rateRaw = params.get('rate');
  const paymentRaw = params.get('payment');

  let principal = DEFAULTS.principal;
  let annualRatePercent = DEFAULTS.annualRatePercent;

  if (principalRaw === null) {
    notices.push('principal');
  } else {
    const parsed = Number(principalRaw);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 100000000) {
      principal = parsed;
    } else {
      notices.push('principal');
    }
  }

  if (rateRaw === null) {
    notices.push('rate');
  } else {
    const parsed = Number(rateRaw);
    const isIncrement = Math.abs(Math.round(parsed * 100) - parsed * 100) < 1e-8;
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 40 && isIncrement) {
      annualRatePercent = parsed;
    } else {
      notices.push('rate');
    }
  }

  const limits = computeInputLimits(principal, annualRatePercent);
  let monthlyPayment = DEFAULTS.monthlyPayment;

  if (paymentRaw === null) {
    notices.push('payment');
  } else {
    const parsed = Number(paymentRaw);
    if (Number.isFinite(parsed) && parsed >= limits.monthlyPayment.min && parsed <= limits.monthlyPayment.max) {
      monthlyPayment = parsed;
    } else {
      notices.push('payment');
    }
  }

  try {
    computeSchedule({ principal, annualRatePercent, monthlyPayment });
  } catch {
    monthlyPayment = DEFAULTS.monthlyPayment;
    notices.push('payment');
  }

  return {
    scenario: {
      principal,
      annualRatePercent,
      monthlyPayment
    },
    notice:
      notices.length > 0
        ? `Some URL values were missing or invalid (${[...new Set(notices)].join(', ')}); safe defaults were used for those fields.`
        : ''
  };
}

function useFormatters() {
  const locale = navigator.language || 'en-US';
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'USD'
      }),
    [locale]
  );

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short'
      }),
    [locale]
  );

  return {
    formatCurrency: (value) => currencyFormatter.format(value),
    formatDate: (isoDate) => (isoDate ? dateFormatter.format(new Date(isoDate)) : 'Not within 100 years')
  };
}

export default function App() {
  const initial = useMemo(() => parseInitialScenario(), []);
  const [scenario, setScenario] = useState(initial.scenario);
  const [draft, setDraft] = useState(() => ({
    principal: initial.scenario.principal.toString(),
    annualRatePercent: initial.scenario.annualRatePercent.toString(),
    monthlyPayment: initial.scenario.monthlyPayment.toFixed(2)
  }));
  const [showInterestOverlay, setShowInterestOverlay] = useState(true);
  const [showTable, setShowTable] = useState(false);
  const [selectedYear, setSelectedYear] = useState('all');
  const [tablePage, setTablePage] = useState(1);
  const [notice, setNotice] = useState(initial.notice);
  const debounceHandles = useRef({});

  const { formatCurrency, formatDate } = useFormatters();

  const limits = useMemo(() => {
    try {
      return computeInputLimits(scenario.principal, scenario.annualRatePercent);
    } catch {
      return computeInputLimits(DEFAULTS.principal, DEFAULTS.annualRatePercent);
    }
  }, [scenario.principal, scenario.annualRatePercent]);

  const calculation = useMemo(() => {
    try {
      return {
        error: '',
        result: computeSchedule(scenario)
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Invalid scenario',
        result: null
      };
    }
  }, [scenario]);

  const yearOptions = useMemo(() => {
    if (!calculation.result) {
      return [];
    }
    const years = Math.ceil(calculation.result.schedule.length / 12);
    return Array.from({ length: years }, (_, index) => index + 1);
  }, [calculation.result]);

  const filteredRows = useMemo(() => {
    if (!calculation.result) {
      return [];
    }

    if (selectedYear === 'all') {
      return calculation.result.schedule;
    }

    const year = Number(selectedYear);
    return calculation.result.schedule.filter(
      (row) => Math.ceil(row.month / 12) === year
    );
  }, [calculation.result, selectedYear]);

  useEffect(() => {
    setTablePage(1);
  }, [selectedYear]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE));
  const pagedRows = filteredRows.slice(
    (tablePage - 1) * ROWS_PER_PAGE,
    tablePage * ROWS_PER_PAGE
  );

  function setScenarioField(field, value) {
    setScenario((previous) => ({ ...previous, [field]: value }));
  }

  function handleSlider(field, value) {
    const parsed = Number(value);
    setDraft((previous) => ({ ...previous, [field]: value }));
    setScenarioField(field, parsed);
  }

  function handleNumberChange(field, value) {
    setDraft((previous) => ({ ...previous, [field]: value }));

    if (debounceHandles.current[field]) {
      clearTimeout(debounceHandles.current[field]);
    }

    debounceHandles.current[field] = setTimeout(() => {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        setScenarioField(field, parsed);
      }
    }, 300);
  }

  async function handleShare() {
    const url = new URL(window.location.href);
    url.searchParams.set('principal', scenario.principal.toFixed(2));
    url.searchParams.set('rate', scenario.annualRatePercent.toFixed(2));
    url.searchParams.set('payment', scenario.monthlyPayment.toFixed(2));

    try {
      await navigator.clipboard.writeText(url.toString());
      setNotice('Share URL copied to clipboard.');
    } catch {
      setNotice('Unable to access clipboard. Copy this URL manually: ' + url.toString());
    }
  }

  function handleExportCsv() {
    if (!calculation.result) {
      return;
    }

    const csv = scheduleToCsv(calculation.result);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'loanscope-schedule.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <main className="app">
      <h1>LoanScope</h1>
      <p className="disclaimer">
        Disclaimer: This calculator is an illustrative estimate, not financial advice,
        and may not match a real lender&apos;s terms exactly.
      </p>

      {notice ? <p className="notice">{notice}</p> : null}
      {calculation.error ? <p className="error">{calculation.error}</p> : null}

      <section className="controls" aria-label="Loan inputs">
        <label>
          Principal
          <input
            type="range"
            min={limits.principal.min}
            max={limits.principal.max}
            step="1"
            value={scenario.principal}
            onChange={(event) => handleSlider('principal', event.target.value)}
          />
          <input
            type="number"
            value={draft.principal}
            min={limits.principal.min}
            max={limits.principal.max}
            step="1"
            onChange={(event) => handleNumberChange('principal', event.target.value)}
          />
        </label>

        <label>
          Annual Rate (%)
          <input
            type="range"
            min={limits.annualRatePercent.min}
            max={limits.annualRatePercent.max}
            step={limits.annualRatePercent.step}
            value={scenario.annualRatePercent}
            onChange={(event) => handleSlider('annualRatePercent', event.target.value)}
          />
          <input
            type="number"
            value={draft.annualRatePercent}
            min={limits.annualRatePercent.min}
            max={limits.annualRatePercent.max}
            step={limits.annualRatePercent.step}
            onChange={(event) =>
              handleNumberChange('annualRatePercent', event.target.value)
            }
          />
        </label>

        <label>
          Monthly Payment
          <input
            type="range"
            min={limits.monthlyPayment.min}
            max={limits.monthlyPayment.max}
            step="0.01"
            value={scenario.monthlyPayment}
            onChange={(event) => handleSlider('monthlyPayment', event.target.value)}
          />
          <input
            type="number"
            value={draft.monthlyPayment}
            min={limits.monthlyPayment.min}
            max={limits.monthlyPayment.max}
            step="0.01"
            onChange={(event) => handleNumberChange('monthlyPayment', event.target.value)}
          />
          <small>
            Minimum amortizing payment: {formatCurrency(limits.minimumAmortizingPayment)}
          </small>
        </label>
      </section>

      <section className="summary" aria-label="Schedule summary">
        <div>
          <strong>Payoff date</strong>
          <div>
            {calculation.result
              ? formatDate(calculation.result.payoffDate)
              : 'Unavailable'}
          </div>
        </div>
        <div>
          <strong>Term</strong>
          <div>
            {calculation.result
              ? `${calculation.result.termYears} years ${calculation.result.termRemainingMonths} months`
              : 'Unavailable'}
          </div>
        </div>
        <div>
          <strong>Total interest</strong>
          <div>
            {calculation.result
              ? formatCurrency(calculation.result.totals.totalInterest)
              : 'Unavailable'}
          </div>
        </div>
      </section>

      <section className="chart-section" aria-label="Balance chart">
        <div className="chart-actions">
          <label>
            <input
              type="checkbox"
              checked={showInterestOverlay}
              onChange={(event) => setShowInterestOverlay(event.target.checked)}
            />
            Show cumulative interest
          </label>
          <button type="button" onClick={handleShare}>Share</button>
          <button type="button" onClick={handleExportCsv} disabled={!calculation.result}>
            Export CSV
          </button>
        </div>

        <div className="chart-wrapper">
          {calculation.result ? (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={calculation.result.schedule}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip
                  formatter={(value) => formatCurrency(Number(value))}
                  labelFormatter={(label) => `Month ${label}`}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="remainingBalance"
                  stroke="#0b57d0"
                  strokeWidth={2}
                  dot={false}
                  name="Remaining Balance"
                />
                {showInterestOverlay ? (
                  <Line
                    type="monotone"
                    dataKey="cumulativeInterest"
                    stroke="#b93815"
                    strokeWidth={2}
                    dot={false}
                    name="Cumulative Interest"
                  />
                ) : null}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p>Enter valid values to render the schedule chart.</p>
          )}
        </div>
      </section>

      <section className="table-section" aria-label="Schedule table">
        <button type="button" onClick={() => setShowTable((value) => !value)}>
          {showTable ? 'Hide schedule table' : 'Show schedule table'}
        </button>

        {showTable && calculation.result ? (
          <>
            <div className="table-controls">
              <label>
                Filter year
                <select
                  value={selectedYear}
                  onChange={(event) => setSelectedYear(event.target.value)}
                >
                  <option value="all">All</option>
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>
                      Year {year}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Payment #</th>
                    <th>Payment</th>
                    <th>Principal</th>
                    <th>Interest</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row) => (
                    <tr key={row.month}>
                      <td>{row.month}</td>
                      <td>{formatCurrency(row.payment)}</td>
                      <td>{formatCurrency(row.principalPortion)}</td>
                      <td>{formatCurrency(row.interestPortion)}</td>
                      <td>{formatCurrency(row.remainingBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <button
                type="button"
                onClick={() => setTablePage((page) => Math.max(1, page - 1))}
                disabled={tablePage === 1}
              >
                Previous
              </button>
              <span>
                Page {tablePage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setTablePage((page) => Math.min(totalPages, page + 1))}
                disabled={tablePage >= totalPages}
              >
                Next
              </button>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
