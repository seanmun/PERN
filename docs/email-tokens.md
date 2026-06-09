# Player invite email — tokens

Reference doc for whoever is designing the invite email HTML externally.

Anywhere you want a dynamic value in the HTML, use a `{{token}}` placeholder.
The server replaces each placeholder before sending. Tokens are
case-sensitive and the double braces are required.

---

## Available tokens

| Token | What it is | Example value |
|---|---|---|
| `{{inviteeName}}` | The recipient's nickname on this event (set by the trip admin when they were added). | `Gerry` |
| `{{inviterName}}` | The trip admin who clicked Invite — their `fullName`, falling back to email local part. | `Sean Munley` |
| `{{eventName}}` | Display name of the trip / outing / match. | `Freedom Fairways Invitational` |
| `{{eventKind}}` | One of `trip`, `outing`, `match`. Use it for copy variants ("this trip" vs "this outing"). | `outing` |
| `{{eventKindNoun}}` | Same kind, ready-to-drop into a sentence: "trip" / "outing" / "match". Identical to `{{eventKind}}` today but kept separate so future kinds can have nicer nouns. | `outing` |
| `{{dateLine}}` | Pre-formatted date string. Multi-day → `Aug 19 – Aug 22, 2026`. Single day → `Aug 8, 2026`. May be **empty** if no date is set on the event. | `Sat Aug 8, 2026` |
| `{{signInUrl}}` | The one-click magic link. New users get account-created, returning users get signed in. Already encoded — drop straight into `href`. | `https://buddycup.golf/sign-in?__clerk_ticket=…&redirect_url=…` |

---

## Notes

- **`{{dateLine}}` can be empty.** If the event has no `startDate`, the token resolves to an empty string. Hide that line in your HTML with a conditional fallback or just let it render blank.
- **Always wire the CTA button to `{{signInUrl}}`.** That's the whole point — it's the magic link. Don't link the button to `https://buddycup.golf` directly or you'll send people to the marketing home instead of into their event.
- **Plain-text version.** Resend also accepts a `text` body for plain-text fallback (good for spam filters + accessibility). Same `{{token}}` substitution applies. Optional but recommended.

---

## Example snippet

```html
<h1>{{eventName}}</h1>
<p>{{dateLine}}</p>
<p>
  Hey {{inviteeName}} — {{inviterName}} added you to this {{eventKindNoun}}
  on BuddyCup. Sign in to claim your spot.
</p>
<a href="{{signInUrl}}">Claim your spot</a>
```

After substitution this becomes:

```html
<h1>Freedom Fairways Invitational</h1>
<p>Sat Aug 8, 2026</p>
<p>
  Hey Gerry — Sean Munley added you to this outing on BuddyCup. Sign in to
  claim your spot.
</p>
<a href="https://buddycup.golf/sign-in?__clerk_ticket=…">Claim your spot</a>
```

---

## What to send back

When the HTML is ready, drop it in `lib/email/invite.html`. The server action
loads that file, swaps the tokens, and sends. No code change needed for HTML
edits after the wiring is in place.
