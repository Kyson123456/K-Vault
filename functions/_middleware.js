/**
 * 全局中间件
 * 处理错误和遥测；末尾追加相册门锁：/album、/api/public/gallery 需要账号密码。
 * 账号密码复用管理后台的环境变量 BASIC_USER / BASIC_PASS（认证惯例见 /api/manage/_middleware.js）。
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

  const user = env.BASIC_USER || '';
  const pass = env.BASIC_PASS || '';
  if (!user || !pass) return needLogin();

  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Basic ')) {
    try {
      const decoded = atob(auth.slice(6));
      const sep = decoded.indexOf(':');
      if (decoded.slice(0, sep) === user && decoded.slice(sep + 1) === pass) {
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
