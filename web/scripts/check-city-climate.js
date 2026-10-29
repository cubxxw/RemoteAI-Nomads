// Run with Playwright CLI's run-code against a local city-page preview.
async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const checks = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.continue());
  const base = new URL(page.url()).origin;
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(base + '/cities/hangzhou/?month=10&climate-check=' + Date.now() + '#season');
  await page.locator('#city-guide[data-ready=true]').waitFor();
  const chart = page.locator('.city-weather-chart'), tooltip = chart.locator('[role=tooltip]');
  await chart.scrollIntoViewIfNeeded();
  const initialPlot = await chart.locator('svg').boundingBox();
  const before = await page.evaluate(() => ({url:location.href,storage:JSON.stringify(localStorage)}));
  for (let month = 1; month <= 12; month++) {
    await chart.locator(`[data-climate-month="${month}"]`).hover();
    assert(await tooltip.isVisible(), 'tooltip hidden for month ' + month);
    assert(await tooltip.locator('[data-climate-label]').innerText() === month + ' 月', 'wrong preview month');
    const cells = page.locator('#season .city-climate-table tbody tr').nth(month - 1).locator('td');
    assert(await tooltip.locator('[data-climate-temperature]').innerText() === await cells.nth(0).textContent(), 'wrong mean for month ' + month);
    assert(await tooltip.locator('[data-climate-rain]').innerText() === await cells.nth(2).textContent(), 'wrong rain for month ' + month);
    assert(await page.locator('#city-month').inputValue() === '10', 'hover changed selected month');
    const bounds = await tooltip.boundingBox(), plot = await chart.boundingBox();
    assert(bounds.x >= plot.x && bounds.x + bounds.width <= plot.x + plot.width, 'tooltip escaped chart');
    const drawing = await chart.locator('svg').boundingBox();
    assert(bounds.y + bounds.height <= drawing.y, 'month preview overlaps climate drawing');
    assert(drawing.y === initialPlot.y, 'preview moved the climate drawing');
  }
  assert(JSON.stringify(before) === JSON.stringify(await page.evaluate(() => ({url:location.href,storage:JSON.stringify(localStorage)}))), 'hover persisted a plan');
  checks.push('all twelve months: tooltip values match data table; hover leaves selected month, URL and saved plan unchanged');
  await page.mouse.move(0,0);
  assert(!await tooltip.isVisible(), 'pointer exit did not dismiss');
  await chart.locator('[data-climate-month="1"]').hover();
  await page.keyboard.press('Escape');
  assert(!await tooltip.isVisible(), 'Escape did not dismiss hover tooltip');
  checks.push('pointer exit and Escape dismiss tooltip');
  await chart.locator('[data-climate-month="1"]').click();
  assert(await page.locator('#city-month').inputValue() === '1', 'click did not select');
  assert(new URL(page.url()).searchParams.get('month') === '1', 'click did not update URL');
  assert(await page.locator('[data-month-temperature]').innerText() === await tooltip.locator('[data-climate-temperature]').innerText(), 'click did not update readout');
  assert(await chart.locator('[data-climate-month="1"]').getAttribute('aria-pressed') === 'true', 'pressed state missing');
  await page.mouse.move(0,0);
  await page.keyboard.press('ArrowLeft');
  assert(await chart.locator('[data-climate-month="12"]').evaluate(el => el === document.activeElement), 'keyboard wrap failed');
  assert(await tooltip.locator('[data-climate-label]').innerText() === '12 月', 'focus did not preview');
  await page.keyboard.press('Enter');
  assert(await page.locator('#city-month').inputValue() === '12', 'Enter did not select');
  await page.keyboard.press('Home');
  assert(await chart.locator('[data-climate-month="1"]').evaluate(el => el === document.activeElement), 'Home failed');
  await page.keyboard.press('End');
  await page.keyboard.press('Space');
  assert(await page.locator('#city-month').inputValue() === '12', 'Space did not select');
  await page.keyboard.press('Escape');
  assert(!await tooltip.isVisible(), 'Escape did not dismiss focus tooltip');
  await page.keyboard.press('Tab');
  assert(!await chart.locator('button').evaluateAll(nodes => nodes.includes(document.activeElement)), 'Tab trapped in chart');
  checks.push('click, Enter and Space select; arrow keys wrap; Home/End and Tab work');
  await page.locator('#city-month').selectOption('6');
  assert(await chart.locator('[data-climate-month="6"]').getAttribute('aria-pressed') === 'true', 'dropdown did not update chart');
  await page.locator('[data-month-step="1"]').click();
  assert(await chart.locator('[data-climate-month="7"]').getAttribute('aria-pressed') === 'true', 'month step did not update chart');
  checks.push('existing dropdown and month arrows stay synchronized');
  for (const width of [320,390,768]) {
    await page.setViewportSize({width,height:1000});
    await chart.scrollIntoViewIfNeeded();
    for (const month of [1,12]) {
      await chart.locator(`[data-climate-month="${month}"]`).hover();
      const bounds = await tooltip.boundingBox();
      assert(bounds.x >= 0 && bounds.x + bounds.width <= width, 'tooltip offscreen at ' + width);
      const drawing = await chart.locator('svg').boundingBox();
      assert(bounds.y + bounds.height <= drawing.y, 'month preview overlaps drawing at ' + width);
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow at ' + width);
  }
  await page.screenshot({path:'output/playwright/climate-hover/tablet-hover.png',fullPage:false});
  checks.push('320, 390 and 768 px: previews stay above drawing without horizontal overflow');
  await page.setViewportSize({width:1440,height:1000});
  await chart.scrollIntoViewIfNeeded();
  await chart.locator('[data-climate-month="6"]').hover();
  await page.screenshot({path:'output/playwright/climate-hover/desktop-hover.png',fullPage:false});
  const touchContext = await page.context().browser().newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  try {
    const touch = await touchContext.newPage();
    await touch.goto(base + '/cities/hangzhou/?month=10#season');
    await touch.locator('#city-guide[data-ready=true]').waitFor();
    await touch.locator('[data-climate-month="3"]').tap();
    assert(await touch.locator('#city-month').inputValue() === '3', 'touch did not select');
    assert(await touch.locator('[role=tooltip]').isVisible(), 'touch did not show tooltip');
    await touch.screenshot({path:'output/playwright/climate-hover/mobile-tap.png',fullPage:false});
    await touch.locator('#season-title').tap();
    assert(!await touch.locator('[role=tooltip]').isVisible(), 'outside tap did not dismiss');
    checks.push('touch: tap selects month and shows tooltip; outside tap dismisses');
  } finally { await touchContext.close(); }
  assert(errors.length === 0, 'page errors: ' + errors.join('; '));
  return {checks,pageErrors:errors};
}
