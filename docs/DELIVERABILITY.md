# Email deliverability — the last 3 records (one-time, ~10 min)

Status: **app → relay → internet all proven**; Gmail rejects on
authentication only. Real captured bounce (Oct 29):

```
gmail-smtp-in.l.google.com: 550-5.7.26 Your email has been blocked
because the sender is unauthenticated. Gmail requires all senders to
authenticate with either SPF or DKIM.
DKIM = did not pass
SPF [mail.nirman.life] with ip: [82.41.67.77] = did not pass
```

Chain already verified end-to-end:

| Hop                       | Result                                       |
| ------------------------- | -------------------------------------------- |
| web container → `mail:25` | `250 Ok: queued` (raw SMTP from inside prod) |
| relay → `gmail-smtp-in`   | reaches Gmail, gets 550 auth rejection       |
| Gmail inbox               | blocked — needs the records below            |

## 1. GoDaddy DNS (nirman.life → DNS Management)

Add **three** records:

| Type | Name | Value                         | TTL |
| ---- | ---- | ----------------------------- | --- |
| TXT  | @    | `v=spf1 ip4:82.41.67.77 ~all` | 600 |
| TXT  | mail | `v=spf1 ip4:82.41.67.77 ~all` | 600 |
| A    | mail | `82.41.67.77`                 | 600 |

- `@` SPF covers `no-reply@nirman.life` (the app's `SMTP_FROM`).
- `mail` A + TXT lets `mail.nirman.life` (the relay's HELO) forward-confirm
  and covers any mail.nirman.life envelope senders.
- `~all` (softfail) is deliberate while only one sender exists — change to
  `-all` later if you want strict.

## 2. PTR record — HeavenCloud / VirtFusion

Reverse DNS lives with the IP owner, not GoDaddy. Either:

- VirtFusion panel → server `82.41.67.77` → Networking / rDNS →
  set PTR to **`mail.nirman.life`**, or
- One-line HeavenCloud ticket:
  > "Please set the PTR (rDNS) record for 82.41.67.77 to mail.nirman.life"

Must be `mail.nirman.life` — it must match the relay's HELO
(`POSTFIX_myhostname`, currently `mail.nirman.life`).

## 3. Verify (after DNS propagates, ~5–30 min)

```bash
dig TXT nirman.life +short        # expect "v=spf1 ip4:82.41.67.77 ~all"
dig A mail.nirman.life +short     # expect 82.41.67.77
dig -x 82.41.67.77 +short         # expect mail.nirman.life
# then send a real test from inside the prod web container:
ssh nirman-vps 'docker exec $(docker ps --format "{{.Names}}" | grep "^web-") \
  node -e "const net=require(\"net\");const s=net.connect(25,\"mail\");let i=0;\
  const c=[\"EHLO web.local\",\"MAIL FROM:<no-reply@nirman.life>\",\
  \"RCPT TO:<sparshagarwal351@gmail.com>\",\"DATA\",\"Subject: ok\\n\\nok\\n.\",\"QUIT\"];\
  s.on(\"data\",d=>{process.stdout.write(d);if(i<c.length)s.write(c[i++]+\"\\r\\n\")});\
  setTimeout(()=>process.exit(0),8000)"'
```

If Gmail still defers after SPF+PTR pass, add DKIM next (needs opendkim
sidecar — small follow-on) or relay through an authenticated smarthost
(`POSTFIX_relayhost` to a provider account — zero DNS work).
