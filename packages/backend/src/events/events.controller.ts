import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';

import type { EventStreamFrame } from '@taskora/shared';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChangeEventHub } from './change-event-hub.service';

/**
 * The per-user Event Stream: one always-on SSE channel carrying Change
 * Events for every write to the user's data (ADR 0005, tier-1 sync).
 *
 * Clients connect with fetch + Bearer header (EventSource cannot send
 * Authorization headers) and reconnect with `?since=<lastSeq>`; the hub
 * replays what the ring buffer still holds and signals `resync` otherwise.
 */
@UseGuards(JwtAuthGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly hub: ChangeEventHub) {}

  @Get()
  async events(
    @Req() req: ExpressRequest & { user: { id: string } },
    @Query('since') sinceRaw: string | undefined,
    @Res() res: ExpressResponse,
  ): Promise<void> {
    const since = sinceRaw !== undefined ? Number.parseInt(sinceRaw, 10) : undefined;
    const validSince =
      since !== undefined && Number.isSafeInteger(since) && since >= 0 ? since : undefined;

    res.status(200).setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const write = (frame: EventStreamFrame) => {
      res.write(`event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`);
    };

    // Initial frames and listener registration are computed atomically by
    // the hub, so no live event can slip in between replay and subscribe.
    const { initialFrames, unsubscribe } = this.hub.subscribe(req.user.id, validSince, (event) =>
      write({ type: 'change', event }),
    );
    for (const frame of initialFrames) {
      write(frame);
    }

    // Keep idle connections open through proxies/load balancers.
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }
}
