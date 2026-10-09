import compression from 'compression';

/** 同步快照的字段时钟高度重复，压缩后能显著减少首次 bootstrap 的传输。 */
export function httpCompression() {
  return compression({
    filter(req, res) {
      // SSE 每个 frame 都必须立即发送，不能被压缩流缓冲。
      const type = String(res.getHeader('Content-Type') ?? '').split(';')[0];
      return type !== 'text/event-stream' && compression.filter(req, res);
    },
  });
}
