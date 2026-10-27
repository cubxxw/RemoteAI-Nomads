import {monthValues} from './city-ui.js';

// The invitation follows the same selected month as the full climate tool.
export function initCityInvitation(root = document.querySelector('#city-guide')) {
  if (!root || root.dataset.invitationReady) return;
  const label = root.querySelector('[data-invitation-month]');
  const temperature = root.querySelector('[data-invitation-temperature]');
  const dataElement = root.querySelector('#city-guide-data');
  if (!label || !temperature || !dataElement) return;
  const data = JSON.parse(dataElement.textContent);
  root.dataset.invitationReady = 'true';
  const update = month => {
    if (!Number.isInteger(month) || month < 1 || month > 12) return;
    const climate = monthValues(data, month);
    label.textContent = `${month} 月均温`;
    temperature.textContent = climate.mean === null ? '待补充' : `${Math.round(climate.mean)}°C`;
  };
  document.addEventListener('nomads:journey-month', event => update(Number(event.detail)));
  update(Number(root.querySelector('#city-month')?.value));
}

if (typeof document !== 'undefined') initCityInvitation();
