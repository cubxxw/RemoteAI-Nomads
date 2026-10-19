const requiredMessage = '线上检查需要明确指定你自己的部署地址：--url https://your-site.example；不会默认连接原项目网站。';
function invalid(message = '线上目标必须是 HTTPS 地址（本机 localhost 可用 HTTP），可带简单目录，不能包含账号密码、查询参数或片段。') {
  const error = new Error(message);
  error.code = 'INVALID_LIVE_TARGET';
  throw error;
}

export function validateLiveOrigin(value) {
  // Validate the literal spelling too: URL normalization would hide /foo/../,
  // empty query/hash delimiters, backslashes, or an empty userinfo component.
  if (typeof value !== 'string' || !/^https?:\/\/[^/?#\\\s@]+(?:\/[a-z0-9-]+)*\/?$/iu.test(value)) invalid();
  let url;
  try { url = new URL(value); } catch { invalid(); }
  if (url.username || url.password || url.search || url.hash) invalid();
  const local = url.hostname === 'localhost' || url.hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/u.test(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) invalid();
  return url.origin + url.pathname.replace(/\/$/,'');
}

export function liveTargetFromArgs(args, { required = false, allowPositional = false } = {}) {
  const targets = [];
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--url') {
      const value = args[++index];
      if (!value || value.startsWith('--')) invalid(requiredMessage);
      targets.push(value);
    } else if (argument.startsWith('--url=')) targets.push(argument.slice('--url='.length));
    else if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(argument)) {
      if (!allowPositional) invalid('线上评测请显式使用 --url 指定你自己的部署地址。');
      targets.push(argument);
    }
  }
  if (targets.length > 1) invalid('请只指定一个线上目标，避免把本机凭据发到错误站点。');
  if (targets.length) return validateLiveOrigin(targets[0]);
  if (required || args.includes('--live')) {
    const error = new Error(requiredMessage);
    error.code = 'LIVE_TARGET_REQUIRED';
    throw error;
  }
  return null;
}
