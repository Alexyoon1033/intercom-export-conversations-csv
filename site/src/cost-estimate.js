const fields = ['estimatedHours', 'hourlyRate', 'migrationQuote'];
const result = document.getElementById('costEstimateResult');
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

document.getElementById('costEstimate').addEventListener('input', () => {
  const [hours, rate, quote] = fields.map((id) => {
    const field = document.getElementById(id);
    return field.value && field.validity.valid ? field.valueAsNumber : null;
  });
  const comparisons = [];
  if (hours !== null && rate !== null) comparisons.push(`Your estimated internal labor: ${money.format(hours * rate)}.`);
  if (quote !== null) comparisons.push(`Your alternative quote: ${money.format(quote)}.`);
  result.textContent = comparisons.join(' ') || 'Enter your own estimates to compare costs.';
});
