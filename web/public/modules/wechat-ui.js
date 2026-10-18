import {icon} from './icons.js';

const opener = document.querySelector('#wechat-open');
const dialog = document.querySelector('#wechat-dialog');
const account = document.querySelector('#wechat-id');
const copy = document.querySelector('#wechat-copy');
const feedback = document.querySelector('#wechat-feedback');
let session = 0;
let resetTimer;
let backdropPressed = false;

function resetCopy() {
  clearTimeout(resetTimer);
  copy.disabled = false;
  copy.innerHTML = `${icon('copy')}<span>复制</span>`;
  copy.setAttribute('aria-label', '复制微信号');
  feedback.textContent = '复制后，在微信中搜索添加。';
  feedback.removeAttribute('data-copied');
}

function outside(event) {
  const rect = dialog.getBoundingClientRect();
  return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
}

if (opener && dialog) {
  opener.addEventListener('click', () => {
    if (dialog.open) return;
    session++;
    resetCopy();
    dialog.showModal();
  });
  document.querySelector('#wechat-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    session++;
    resetCopy();
    backdropPressed = false;
    opener.focus({preventScroll: true});
  });
  dialog.addEventListener('pointerdown', event => {
    backdropPressed = event.target === dialog && outside(event);
  });
  dialog.addEventListener('click', event => {
    if (backdropPressed && event.target === dialog && outside(event)) dialog.close();
    backdropPressed = false;
  });
  dialog.addEventListener('keydown', event => {
    // Page shortcuts must not open another panel above this modal.
    event.stopPropagation();
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') event.preventDefault();
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled)')];
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  copy.addEventListener('click', async () => {
    const current = session;
    clearTimeout(resetTimer);
    copy.disabled = true;
    let copied = false;
    try {
      await navigator.clipboard.writeText(account.value);
      copied = true;
    } catch {
      if (!dialog.open || current !== session) return;
      account.focus({preventScroll: true});
      account.select();
      account.setSelectionRange(0, account.value.length);
      // Older embedded browsers may expose selection copy without Clipboard API.
      try { copied = document.execCommand('copy'); } catch { /* Keep the selected ID for manual copy. */ }
    }
    if (!dialog.open || current !== session) return;
    copy.disabled = false;
    if (copied) {
      copy.innerHTML = `${icon('check')}<span>已复制</span>`;
      copy.setAttribute('aria-label', '微信号已复制');
      copy.focus({preventScroll: true});
      feedback.textContent = '微信号已复制，去微信搜索即可。';
      feedback.dataset.copied = 'true';
      resetTimer = setTimeout(resetCopy, 4000);
    } else {
      feedback.textContent = '请选中微信号手动复制，再去微信搜索。';
    }
  });
}
