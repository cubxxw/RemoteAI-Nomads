// Dated public ECB reference, matching the reviewed public price snapshot.
// Keep both the date and source visible wherever this conversion is offered.
export const RANKING_FX={date:'2026-10-16',source:'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html',cnyPerUSD:7.524/1.1253};
export const referenceBudgetIn=(amount,currency='USD')=>Number.isFinite(amount)?amount*(currency==='CNY'?RANKING_FX.cnyPerUSD:1):null;
export const budgetSymbol=currency=>currency==='CNY'?'¥':'$';
