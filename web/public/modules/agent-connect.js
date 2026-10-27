import {connectionPrompts} from './connection-examples.js';

export async function copyField(field, feedback, clipboard = globalThis.navigator?.clipboard) {
  try {
    if (!clipboard?.writeText) throw new Error('Clipboard unavailable');
    await clipboard.writeText(field.value);
    feedback.textContent = '已复制，可以粘贴到客户端。';
    return true;
  } catch {
    field.focus();
    field.select();
    feedback.textContent = '未能自动复制，已选中文本。请长按或使用复制快捷键。';
    return false;
  }
}

export function initConnection(root, prompts) {
  const feedback = root.querySelector('#connect-feedback');
  for (const button of root.querySelectorAll('[data-connect-copy]')) {
    button.hidden = false;
    const label = button.querySelector('span');
    const originalLabel = label.textContent;
    let reset;
    button.addEventListener('click', async () => {
      const copied = await copyField(root.querySelector('#' + button.dataset.connectCopy), feedback);
      clearTimeout(reset);
      label.textContent = copied ? '已复制' : '手动复制';
      reset = setTimeout(() => {label.textContent = originalLabel;}, 1800);
    });
  }
  const choice = root.querySelector('.connect-client-choice');
  const select = root.querySelector('#connect-client');
  choice.hidden = false;
  const selectClient = (announce = true) => {
    for (const panel of root.querySelectorAll('[data-connect-client]')) panel.hidden = panel.dataset.connectClient !== select.value;
    if (announce) feedback.textContent = '已显示' + select.options[select.selectedIndex].text + '的接入方法。';
  };
  select.addEventListener('change', () => selectClient());
  // Restore browser-persisted form state after back/forward navigation.
  selectClient(false);
  const examples = [...root.querySelectorAll('[data-connect-example]')];
  for (const button of examples) {
    button.hidden = false;
    button.addEventListener('click', () => {
      for (const other of examples) other.setAttribute('aria-pressed', String(other === button));
      root.querySelector('#connect-prompt').value = prompts[Number(button.dataset.connectExample)];
      feedback.textContent = '已切换示例：' + button.textContent + '。';
    });
  }
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('#agent-connect');
  if (root) {
    initConnection(root, connectionPrompts.map(prompt => prompt.text));
  }
}
