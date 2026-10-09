import compression from 'compression';
import type { Connect, Plugin } from 'vite';

/** 开发服务器直接传输源码和 WASM，避免首屏下载未压缩的大响应。 */
export function devLoading(): Plugin {
  return {
    name: 'taskora-dev-loading',
    apply: 'serve',
    enforce: 'post',
    configureServer(server) {
      // compression 支持 Connect，但类型声明只提供 Express 签名。
      server.middlewares.use(
        compression({
          filter(req, res) {
            // mime-db 没有把 application/wasm 标记为可压缩。
            const type = String(res.getHeader('Content-Type') ?? '').split(';')[0];
            return type === 'application/wasm' || compression.filter(req, res);
          },
        }) as unknown as Connect.NextHandleFunction,
      );
    },
    transform(code, id) {
      const file = id.split('?', 1)[0];
      if (file.includes('/@sqlite.org/sqlite-wasm/') && file.endsWith('.mjs')) {
        // Vite 会给缺少 map 的 JS 注入包含源码的 fallback inline map，
        // SQLite 生成脚本因此从约 643 KB 膨胀到 3.65 MB。
        // 空 mappings 只关闭该第三方脚本的 map，保留应用源码的调试映射。
        return { code, map: { mappings: '' } };
      }
    },
  };
}
