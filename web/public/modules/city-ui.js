export const numberOrNull = (value) => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

export function planBudget({ rent, food, other, days }) {
  const length = Number(days), values = [rent, food, other].map(numberOrNull);
  if (!Number.isInteger(length) || length < 1 || length > 365 || values.some(value => value !== null && value < 0)) return { amount: null, error: true, missing: [] };
  const missing = ['房租', '餐费', '其他开销'].filter((_, i) => values[i] === null);
  if (values.every(value => value === null)) return { amount: null, error: false, missing };
  return { amount: Math.round(((values[0] || 0) + (values[2] || 0)) * length / 30 + (values[1] || 0) * length), error: false, missing };
}

export function formatAmount(amount, currency = 'USD') {
  if (numberOrNull(amount) === null) return '待补充';
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: currency === 'JPY' || Math.abs(Number(amount)) >= 100 ? 0 : 2 }).format(amount);
}

// Shanghai has no clock changes. The destination's IANA zone handles its own DST.
export function meetingTime(date, hour, timeZone) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(Number(hour)) || Number(hour) < 0 || Number(hour) > 23 || !timeZone) return null;
  const [year, month, day] = date.split('-').map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.toISOString().slice(0, 10) !== date) return null;
  const instant = new Date(Date.UTC(year, month - 1, day, Number(hour) - 8));
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant).map(p => [p.type, p.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
  } catch { return null; }
}

export function timeDifference(date, timeZone, hour = 12) {
  const local = meetingTime(date, hour, timeZone);
  if (!local) return '时差待补充';
  const difference = Math.round((Date.parse(`${local.date}T${local.time}:00Z`) - Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00Z`)) / 60000);
  if (!difference) return '与北京同一时间';
  const minutes = Math.abs(difference), hours = Math.floor(minutes / 60), rest = minutes % 60;
  const duration = [hours && `${hours} 小时`, rest && `${rest} 分钟`].filter(Boolean).join(' ');
  return `比北京${difference > 0 ? '快' : '慢'} ${duration}`;
}

export function monthValues(data, month) {
  const climate = data.climate.find(row => Number(row.month) === Number(month));
  const season = data.months.find(row => Number(row.month) === Number(month));
  return {
    month: Number(month), mean: numberOrNull(climate?.mean_c), rain: numberOrNull(climate?.rain_mm), high: numberOrNull(climate?.high_c),
    status: season?.suitability || 'unknown', note: season?.evidence_note || '',
  };
}

export const seasonLabel = status => ({ recommended: '原资料推荐', caution: '留意季节', unknown: '月份未判定' })[status] || '月份未判定';
const climateText = (value, unit) => value === null ? '待补充' : `${Math.round(value)}${unit}`;

export function cityPlanQuestion(plan) {
  const month = Number(plan.month), days = Number(plan.days);
  const currency = ['CNY', 'USD', 'JPY'].includes(plan.currency) ? plan.currency : '币种待确认';
  const amount = (value, unit) => {
    if (value === '' || value === null || value === undefined) return '未填写（尚未计入，不能当作 0）';
    const number = numberOrNull(value);
    return number === null || number < 0 ? '无效（需要确认）' : `${number} ${currency} / ${unit}`;
  };
  return [
    `我想去${plan.city || '这座城市'}，请根据我在城市页当前填写的条件，帮我核对季节、预算和远程工作安排。`,
    `出发月份：${Number.isInteger(month) && month >= 1 && month <= 12 ? month + ' 月' : '未填写（需要确认）'}；停留天数：${Number.isInteger(days) && days >= 1 && days <= 365 ? days + ' 天' : '未填写或无效（需要确认）'}。`,
    '以下金额都是我的规划假设，不是已核实的报价或最低预算：',
    `月租：${amount(plan.rent, '月')}；餐费：${amount(plan.food, '天')}；其他开销：${amount(plan.other, '月')}。`,
    '月支出按 30 天折算仅作规划估算，不是短租报价。请按这些假设讨论可行安排，并列出未填项和需要核实的内容。',
  ].join('\n');
}

export function initCityPage(root = document.querySelector('#city-guide')) {
  if (!root || root.dataset.ready) return;
  const dataElement = root.querySelector('#city-guide-data');
  if (!dataElement) return;
  const data = JSON.parse(dataElement.textContent);
  root.dataset.ready = 'true';
  const monthSelect = root.querySelector('#city-month');
  function updateMonth() {
    const values = monthValues(data, monthSelect.value);
    root.querySelector('[data-month-temperature]').textContent = climateText(values.mean, '°C');
    root.querySelector('[data-month-rain]').textContent = climateText(values.rain, ' mm');
    const status = root.querySelector('[data-month-status]');
    status.textContent = seasonLabel(values.status);
    status.dataset.status = values.status;
    root.querySelector('[data-month-note]').textContent = /继承|Notion/.test(values.note) ? '月份标签来自旧资料，可结合气温和降雨一起判断。' : values.note || '原资料没有给这个月份下结论。';
    root.querySelectorAll('[data-chart-month]').forEach(node => node.classList.toggle('is-current', Number(node.dataset.chartMonth) === values.month));
    root.querySelector('[data-selected-month]').textContent = `${values.month} 月`;
  }
  monthSelect.addEventListener('change', updateMonth);
  root.querySelectorAll('[data-month-step]').forEach(button => button.addEventListener('click', () => {
    monthSelect.value = String((Number(monthSelect.value) - 1 + Number(button.dataset.monthStep) + 12) % 12 + 1);
    updateMonth();
  }));
  const days = root.querySelector('#trip-days'), currency = root.querySelector('#trip-currency');
  root.querySelectorAll('[data-agent-open]').forEach(button => button.addEventListener('click', () => {
    button.dataset.agentQuestion = cityPlanQuestion({
      city: root.querySelector('.city-breadcrumbs [aria-current="page"]')?.textContent.trim(),
      month: monthSelect?.value, days: days?.value, currency: currency?.value,
      rent: root.querySelector('#budget-rent')?.value,
      food: root.querySelector('#budget-food')?.value,
      other: root.querySelector('#budget-other')?.value,
    });
  }));
  if (days && currency) {
    const output = root.querySelector('[data-trip-total]'), feedback = root.querySelector('[data-trip-feedback]');
    function updateBudget() {
      const rate = data.budget.rates[currency.value];
      const estimate = planBudget({ days: days.value, rent: root.querySelector('#budget-rent').value, food: root.querySelector('#budget-food').value, other: root.querySelector('#budget-other').value });
      days.setAttribute('aria-invalid', String(!Number.isInteger(Number(days.value)) || Number(days.value) < 1 || Number(days.value) > 365));
      root.querySelectorAll('[data-budget-input]').forEach(input => input.setAttribute('aria-invalid', String(input.value !== '' && Number(input.value) < 0)));
      output.textContent = estimate.amount === null ? '—' : formatAmount(estimate.amount, currency.value);
      feedback.textContent = estimate.error ? '天数应为 1–365，金额应不小于 0。' : estimate.amount === null ? '填入一项开销开始计算' : `${days.value} 天${estimate.missing.length ? ` · 未计入${estimate.missing.join('、')}` : ' · 已包含三项开销'}`;
      root.querySelectorAll('[data-money-amount]').forEach(node => {
        node.textContent = formatAmount(Number(node.dataset.moneyAmount) * (rate?.rate || 1), rate ? currency.value : data.budget.currency);
      });
      const fx = root.querySelector('[data-fx-note]');
      if (fx) fx.textContent = currency.value === data.budget.currency ? '人民币展示，原币价格见来源' : rate ? `换算日期 ${rate.date || '未标明'} · 汇率仅供参考` : '该币种汇率待补充，显示来源币种';
    }
    days.addEventListener('input', updateBudget);
    root.querySelectorAll('[data-budget-input]').forEach(input => input.addEventListener('input', updateBudget));
    let previousCurrency = currency.value;
    currency.addEventListener('change', () => {
      const from = data.budget.rates[previousCurrency]?.rate || 1, to = data.budget.rates[currency.value]?.rate || 1;
      root.querySelectorAll('[data-budget-input]').forEach(input => { if (input.value !== '') input.value = String(Number((Number(input.value) / from * to).toFixed(2))); });
      root.querySelectorAll('[data-input-currency]').forEach(node => { node.textContent = currency.value; });
      previousCurrency = currency.value; updateBudget();
    });
    root.querySelectorAll('[data-budget-fill]').forEach(button => button.addEventListener('click', () => {
      const amount = Number(button.dataset.budgetFill) * (data.budget.rates[currency.value]?.rate || 1);
      root.querySelector('#budget-rent').value = String(Math.round(amount)); updateBudget();
      root.querySelector('[data-budget-chosen]').textContent = `已采用：${button.dataset.budgetLabel}`;
    }));
  }
  const date = root.querySelector('#meeting-date'), hour = root.querySelector('#meeting-hour');
  if (date && hour) {
    function updateMeeting() {
      const result = meetingTime(date.value, Number(hour.value), data.timeZone);
      root.querySelector('[data-meeting-time]').textContent = result?.time || '待补充';
      root.querySelector('[data-meeting-date]').textContent = result ? `${result.date}${result.date !== date.value ? ' · 跨日' : ''}` : '请选择有效日期';
      root.querySelector('[data-time-difference]').textContent = timeDifference(date.value, data.timeZone, Number(hour.value));
      root.querySelector('[data-time-difference-date]').textContent = result ? `${date.value} · 换算会议时间` : '选择会议日期后换算';
    }
    date.addEventListener('change', updateMeeting); hour.addEventListener('change', updateMeeting);
  }
  root.querySelectorAll('[data-city-anchor]').forEach(anchor => anchor.addEventListener('click', () => {
    root.querySelectorAll('[data-city-anchor]').forEach(a => a.removeAttribute('aria-current'));
    anchor.setAttribute('aria-current', 'location');
  }));
  const sectionNav = root.querySelector('.city-section-nav');
  const sections = [...root.querySelectorAll('.city-section')];
  let scrollFrame = null;
  const updateSection = () => {
    scrollFrame = null;
    const threshold = sectionNav.getBoundingClientRect().bottom + 32;
    const active = sections.filter(section => section.getBoundingClientRect().top <= threshold).at(-1) || sections[0];
    root.querySelectorAll('[data-city-anchor]').forEach(anchor => {
      if (anchor.hash === '#' + active?.id) anchor.setAttribute('aria-current', 'location');
      else anchor.removeAttribute('aria-current');
    });
  };
  const scheduleSection = () => { if (scrollFrame === null) scrollFrame = requestAnimationFrame(updateSection); };
  addEventListener('scroll', scheduleSection, {passive:true});
  addEventListener('resize', scheduleSection);
  updateSection();
}

if (typeof document !== 'undefined') initCityPage();
