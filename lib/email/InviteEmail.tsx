import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';

/**
 * Player-invite email. Sent when a trip admin clicks "Invite" on a player
 * row in /admin/players. Keeps copy specific to the event (name + kind) so
 * recipients know what they're signing into, not just "join BuddyCup."
 *
 * Rendered to HTML by Resend at send time. The link goes through Clerk's
 * sign-in with a redirect to the trip; the lazy-claim flow attaches their
 * tripMember row when they sign in for the first time.
 */

export type InviteEmailProps = {
  inviteeName: string;          // tripMember.nickname or email local-part
  inviterName: string;          // admin who added them
  eventName: string;            // trip.name
  eventKind: 'trip' | 'outing' | 'match';
  dateLine: string | null;      // pre-formatted, e.g. "Aug 19–22, 2026" or "Sat Aug 8" or null
  signInUrl: string;            // absolute URL to /sign-in?redirect_url=...
};

const COLORS = {
  bg: '#0a0a0a',
  surface: '#18181b',
  border: '#27272a',
  text: '#f4f4f5',
  muted: '#a1a1aa',
  dim: '#71717a',
  gold: '#eab308',
  goldText: '#000000',
};

function kindNoun(kind: InviteEmailProps['eventKind']): string {
  return kind === 'trip' ? 'trip' : kind === 'outing' ? 'outing' : 'match';
}

export default function InviteEmail({
  inviteeName,
  inviterName,
  eventName,
  eventKind,
  dateLine,
  signInUrl,
}: InviteEmailProps) {
  const noun = kindNoun(eventKind);
  const preview = `${inviterName} added you to ${eventName} on BuddyCup`;

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: COLORS.bg,
          color: COLORS.text,
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          margin: 0,
          padding: '32px 0',
        }}
      >
        <Container
          style={{
            maxWidth: 560,
            margin: '0 auto',
            padding: '0 16px',
          }}
        >
          <Section
            style={{
              backgroundColor: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 4,
              padding: '32px 28px',
            }}
          >
            <Text
              style={{
                color: COLORS.gold,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
                margin: 0,
              }}
            >
              You&rsquo;re in
            </Text>

            <Text
              style={{
                color: COLORS.text,
                fontSize: 28,
                fontWeight: 700,
                lineHeight: 1.15,
                margin: '12px 0 8px 0',
              }}
            >
              {eventName}
            </Text>

            {dateLine && (
              <Text
                style={{
                  color: COLORS.muted,
                  fontSize: 13,
                  margin: '0 0 24px 0',
                }}
              >
                {dateLine}
              </Text>
            )}

            <Text
              style={{
                color: COLORS.text,
                fontSize: 15,
                lineHeight: 1.55,
                margin: '16px 0',
              }}
            >
              Hey {inviteeName} — {inviterName} added you to this {noun} on
              BuddyCup. Sign in to claim your spot, set your photo, and see the
              matchups.
            </Text>

            <Section style={{ marginTop: 28, marginBottom: 8 }}>
              <Button
                href={signInUrl}
                style={{
                  backgroundColor: COLORS.gold,
                  color: COLORS.goldText,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  padding: '14px 28px',
                  borderRadius: 2,
                  display: 'inline-block',
                  textDecoration: 'none',
                }}
              >
                Claim your spot
              </Button>
            </Section>

            <Text
              style={{
                color: COLORS.dim,
                fontSize: 12,
                lineHeight: 1.5,
                margin: '24px 0 0 0',
              }}
            >
              Or paste this link in your browser:
              <br />
              <span style={{ color: COLORS.muted, wordBreak: 'break-all' }}>
                {signInUrl}
              </span>
            </Text>

            <Hr
              style={{
                border: 'none',
                borderTop: `1px solid ${COLORS.border}`,
                margin: '28px 0 16px 0',
              }}
            />

            <Text
              style={{
                color: COLORS.dim,
                fontSize: 11,
                margin: 0,
              }}
            >
              You&rsquo;re getting this because {inviterName} added your email
              to a BuddyCup roster. If this wasn&rsquo;t expected, you can
              safely ignore it.
            </Text>
          </Section>

          <Text
            style={{
              color: COLORS.dim,
              fontSize: 11,
              textAlign: 'center',
              marginTop: 16,
            }}
          >
            BuddyCup — trip-app for golf buddies
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
