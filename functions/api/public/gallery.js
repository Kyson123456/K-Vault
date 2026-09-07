/**
 * 公开画廊接口（相册页 /album 使用）
 *
 * GET /api/public/gallery?folder=<文件夹路径>&limit=<1..500>
 *
 * 返回: { success, total, files: [{ name, src, ts }] }
 *  - 仅列出 KV 中的图片文件（jpg/png/gif/webp 等）
 *  - folder 留空时列出全部图片；填写时只列出 folderPath 完全匹配的文件夹
 *  - src 为公开直链（/file/<key>，无需登录即可访问）
 *
 * 注意：本接口是公开的（无鉴权），任何拿到链接的人都能看图，
 * 建议用 folder 参数限定只暴露相册文件夹，不要无过滤地开放全站图片。
 */

const IMAGE_EXTS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'ico', 'svg', 'heic', 'heif', 'avif',
]);

const INVALID_PREFIXES = ['session:', 'chunk:', 'upload:', 'temp:', 'folder:', 'paste:', 'pic:'];

function normalizeFolderPath(value = '') {
  const raw = String(value || '').replace(/\\/g, '/').trim();
  const output = [];
  for (const part of raw.split('/')) {
    const piece = part.trim();
    if (!piece || piece === '.') continue;
    if (piece === '..') {
      output.pop();
      continue;
    }
    output.push(piece);
  }
  return output.join('/');
}

function isImageKey(name) {
  const segments = String(name || '').split('.');
  if (segments.length < 2) return false;
  const ext = segments.pop().toLowerCase();
  return IMAGE_EXTS.has(ext);
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', ...headers },
  });
}

export async function onRequestGet({ request, env }) {
  if (!env.img_url) {
    return json({ success: false, error: 'KV (img_url) 未绑定' }, 500);
  }

  const url = new URL(request.url);
  const folder = normalizeFolderPath(url.searchParams.get('folder') || '');
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '500', 10) || 500, 1), 500);

  const files = [];
  let cursor;
  let scanned = 0;
  const MAX_SCAN = 5000;

  do {
    const res = await env.img_url.list({ cursor, limit: 1000 });
    for (const key of res.keys) {
      scanned++;
      if (INVALID_PREFIXES.some((p) => key.name.startsWith(p))) continue;
      const meta = key.metadata || {};
      if (meta.folderMarker === true) continue;
      if (!meta.fileName || meta.TimeStamp == null) continue;
      if (!isImageKey(key.name)) continue;
      const keyFolder = normalizeFolderPath(meta.folderPath || meta.path || '');
      if (folder !== '' && keyFolder !== folder) continue;
      files.push({
        name: meta.fileName,
        src: `/file/${encodeURIComponent(key.name)}`,
        ts: Number(meta.TimeStamp) || 0,
      });
    }
    cursor = res.cursor;
  } while (cursor && scanned < MAX_SCAN);

  files.sort((a, b) => b.ts - a.ts);

  return json({ success: true, total: files.length, files: files.slice(0, limit) }, 200, {
    // 浏览器缓存 45 秒，配合 60 秒轮询可大幅减少 KV 列出次数
    'Cache-Control': 'public, max-age=45',
  });
}
