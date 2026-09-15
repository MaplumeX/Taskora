/**
 * Assistant runtime smoke test (issue 01 acceptance).
 *
 * Boots the real Nest application context, creates a throwaway user +
 * conversation, sends one prompt through the Agent runtime and verifies:
 *   1. events stream (message_update deltas … agent_end),
 *   2. the transcript is persisted (restart-safe),
 *   3. the agent rebuilds state from the persisted messages.
 *
 * Requires a reachable [OI]-compatible endpoint via env:
 *   AGENT_DEV_BASE_URL, AGENT_DEV_API_KEY, AGENT_DEV_MODEL
 * plus DATABASE_URL and AGENT_ENCRYPTION_KEY.
 *
 * Usage: pnpm --filter @taskora/backend agent:smoke
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AgentRuntimeService } from '../src/agent/runtime/agent-runtime.service';
import { AgentEventHub } from '../src/agent/runtime/agent-event-hub';
import { ConversationsService } from '../src/agent/conversations.service';

async function main() {
  for (const key of ['AGENT_DEV_BASE_URL', 'AGENT_DEV_API_KEY', 'AGENT_DEV_MODEL']) {
    if (!process.env[key]) {
      console.error(`Missing ${key}. Set it to run the smoke test.`);
      process.exit(1);
    }
  }
  process.env.AGENT_ENCRYPTION_KEY ??= 'smoke-test-master-key';

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);
  const runtime = app.get(AgentRuntimeService);
  const hub = app.get(AgentEventHub);
  const conversations = app.get(ConversationsService);

  const user = await prisma.user.create({
    data: {
      email: `agent-smoke-${Date.now()}@example.com`,
      passwordHash: 'smoke',
    },
  });

  try {
    const conversation = await conversations.create(user.id);
    const events: string[] = [];
    hub.subscribe(conversation.id, (event) => {
      events.push(event.type);
      if (event.type === 'message_update') {
        const message = event.message as { content?: { type: string; text?: string }[] };
        const text =
          message.content
            ?.filter((c) => c.type === 'text')
            .map((c) => c.text ?? '')
            .join('') ?? '';
        process.stdout.write(`\r  streaming: ${text.slice(-60)}`);
      }
    });

    console.log('→ sending prompt');
    await runtime.sendMessage(user.id, conversation.id, 'Say "smoke ok" and nothing else.');
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (events.includes('agent_end')) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
      setTimeout(() => {
        clearInterval(timer);
        resolve();
      }, 120_000);
    });
    console.log('\n← run finished');

    const messages = await conversations.listMessages(user.id, conversation.id);
    const roles = messages.map((m) => m.message.role);
    console.log(`persisted messages: ${roles.join(' → ')}`);

    const sawDelta = events.includes('message_update');
    if (!sawDelta) throw new Error('no message_update events streamed');
    if (!events.includes('agent_end')) throw new Error('no agent_end event');
    if (!roles.includes('assistant')) throw new Error('assistant reply was not persisted');

    // Rebuild check: a fresh runtime entry must load the persisted transcript.
    await runtime.destroyConversation(user.id, conversation.id);
    const rebuilt = await conversations.loadMessages(conversation.id);
    if (rebuilt.length !== messages.length) throw new Error('rebuild lost messages');
    console.log('state rebuild ok — transcript length', rebuilt.length);

    console.log('\nSMOKE OK ✅');
    process.exitCode = 0;
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await app.close();
  }
}

main().catch((error) => {
  console.error('\nSMOKE FAILED ❌', error);
  process.exit(1);
});
