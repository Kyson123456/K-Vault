/**
 * 全局中间件
 * 处理错误和遥测；末尾追加相册门锁：/album、/api/public/gallery 需要账号密码。
 * 支持两套账号：管理后台账号（BASIC_USER / BASIC_PASS）+ 游客账号（ALBUM_GUEST_USER / ALBUM_GUEST_PASS）。
 * 游客账号只能看相册，进不了管理后台（后台验证只认 BASIC_USER / BASIC_PASS）。
 */
import { errorHandling, telemetryData } from './utils/middleware';

// ---- 相册门锁（追加部分）开始 ----
const LOCKED_PREFIXES = ['/album', '/api/public/gallery'];

function needLogin() {
  return new Response('需要登录才能查看相册', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="album", charset="UTF-8"' },
  });
}

async function albumGate({ request, env, next }) {
  const path = new URL(request.url).pathname;

  if (!LOCKED_PREFIXES.some((p) => path.startsWith(p))) {
    return next();
  }

  // 多套账号：后台账号 + 游客账号；没配置的自动忽略
  const accounts = [
    [env.BASIC_USER, env.BASIC_PASS],
    [env.ALBUM_GUEST_USER, env.ALBUM_GUEST_PASS],
  ].filter(([u, p]) => u && p);

  if (accounts.length === 0) return needLogin();

  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Basic ')) {
    try {
      const decoded = atob(auth.slice(6));
      const sep = decoded.indexOf(':');
      const u = decoded.slice(0, sep);
      const p = decoded.slice(sep + 1);
      if (accounts.some(([user, pass]) => u === user && p === pass)) {
        return next();
      }
    } catch (e) {
      // 头部格式不对，按未登录处理
    }
  }
  return needLogin();
}
// ---- 相册门锁（追加部分）结束 ----

export const onRequest = [errorHandling, telemetryData, albumGate];
