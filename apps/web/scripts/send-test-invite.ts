/**
 * One-shot: send a fully-rendered invite email to a target address (for
 * Email-on-Acid / aboutmy.email-style multi-client rendering tests).
 *
 * Usage: TARGET=... npx tsx scripts/send-test-invite.ts
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Resend } from 'resend';

loadEnv({ path: '.env.local' });

const TARGET =
  process.env.TARGET ?? 'item.glove.factory@aboutmy.email';

const SAMPLE = {
  inviteeName: 'Gerry',
  inviterName: 'Sean Munley',
  eventName: 'Freedom Fairways Invitational',
  eventKind: 'outing' as const,
  eventKindNoun: 'outing',
  dateLine: 'Sat Aug 8, 2026',
  // Real-looking but inert. Don't send the actual Clerk URL in a public render test.
  signInUrl: 'https://buddycup.golf/sign-in?__clerk_ticket=demo&redirect_url=%2Ftrips%2Fdemo%2Fschedule',
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const fromName = process.env.RESEND_FROM_NAME ?? 'BuddyCup';
  if (!apiKey) throw new Error('RESEND_API_KEY missing');
  if (!fromEmail) throw new Error('RESEND_FROM_EMAIL missing');

  const tplPath = path.join(process.cwd(), 'lib', 'email', 'invite.html');
  const template = await fs.readFile(tplPath, 'utf-8');

  const subs: Record<string, string> = {
    inviteeName: escapeHtml(SAMPLE.inviteeName),
    inviterName: escapeHtml(SAMPLE.inviterName),
    eventName: escapeHtml(SAMPLE.eventName),
    eventKind: SAMPLE.eventKind,
    eventKindNoun: SAMPLE.eventKindNoun,
    dateLine: escapeHtml(SAMPLE.dateLine),
    signInUrl: SAMPLE.signInUrl,
  };
  const html = template.replace(
    /\{\{([a-zA-Z_]+)\}\}/g,
    (_m, name: string) =>
      Object.prototype.hasOwnProperty.call(subs, name) ? subs[name] : '',
  );

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to: TARGET,
    subject: `[BuddyCup test] ${SAMPLE.inviterName} added you to ${SAMPLE.eventName}`,
    html,
  });

  if (error) {
    console.error('FAILED:', error);
    process.exit(1);
  }
  console.log('SENT', { id: data?.id, to: TARGET });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
