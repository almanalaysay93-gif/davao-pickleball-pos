# PSP Comparison - PayMongo vs Xendit vs Maya

Date researched: 2026-08-18.
Sources: official developer docs, official API references, official pricing pages only.

## The question

Flow 1 sends a Player's court booking payment (PHP 180-600) into the Venue's own account.
Each Venue is an independent business on one multi-tenant platform.
The Platform takes no cut on bookings today.
The current design makes each Venue paste their own PayMongo API keys into settings, and the platform stores the secret key and webhook secret encrypted at rest.
That design exists only because we believed PayMongo has no Stripe-Connect equivalent.
This note tests that belief against primary docs.

## Bottom line

**The belief is wrong. PayMongo has a Stripe-Connect equivalent, and it is live.**

PayMongo calls it Linked Accounts plus Onboarding-as-a-Service.
One parent account (our platform) creates, verifies, and activates child accounts (our Venues) over the API.
The platform then transacts on a child's behalf with its own parent secret key plus an `Account-Id: org_childId` header.
Checkout Sessions v1 and v2 are on the supported resource list.
Source: https://docs.paymongo.com/docs/account-settings-linked-transactions

**Kill the BYO-keys design.**
No Venue ever needs to generate or paste an API key.
The platform holds exactly one secret key - its own.
The encrypted-credentials store, the per-Venue key rotation problem, and the per-Venue webhook secret store all disappear.

Xendit also supports this, through xenPlatform sub-accounts and the `for-user-id` header.
Xendit is a viable second choice but carries a USD 50 minimum monthly fee and higher headline rates.
Source: https://docs.xendit.co/docs/transaction-fees

Maya does **not** fit Flow 1.
Its only multi-merchant model is Payment Facilitator, where transactions process under the PayFac's own account and sub-merchants are tagged per request.
Money would land in our account, not the Venue's.
Maya also publishes no webhook signature scheme.
Source: https://developers.maya.ph/reference/accept-payments-as-a-payment-facilitator-in-maya-checkout

Recommendation: stay on PayMongo, and rebuild Flow 1 on Linked Accounts.

## Comparison table

| Axis | PayMongo | Xendit | Maya |
| --- | --- | --- | --- |
| 1. Platform / sub-merchant | SUPPORTED. Parent/child accounts, API onboarding, `Account-Id` header, `split_payment` for a platform cut. | SUPPORTED. xenPlatform sub-accounts, `for-user-id` header, `with-split-rule` header. Dashboard activation request needed. | NOT SUPPORTED for Flow 1. PayFac only; funds settle to the PayFac. Needs Relationship Manager approval. |
| 2. Fee pass-through | `pass_on_fees` boolean on v2 Checkout Sessions. PayMongo calculates the grossed-up total itself. | No API flag found. Help Center says the merchant computes the total. | No documented flag. UNCLEAR. |
| 3. Hosted checkout | `POST /v2/checkout_sessions`, returns `checkout_url`. Expire endpoint exists. HMAC-SHA256 webhook signature. | `POST /sessions` mode `PAYMENT_LINK`, returns `payment_link_url`. Cancel endpoint exists. Static `x-callback-token`. | `POST /checkout/v1/checkouts`, returns `redirectUrl`. No cancel endpoint found. No signature scheme; IP allowlist only. |
| 4. Onboarding | Test keys issued at signup, before activation. DTI/SEC + BIR 2303 for live. | Test mode at signup. Verification stated as 14 working days. | Public shared sandbox keys, no account needed. Live needs Maya Business Manager. |

## PayMongo

### Axis 1 - Platform / sub-merchant: SUPPORTED

Linked accounts connect two PayMongo accounts as parent and child.
"**Linked accounts** connect two PayMongo accounts in a relationship where one side, the **parent**, can onboard and operate on behalf of the other, the **child**."
The page names our exact shape: "a marketplace with sellers, a platform with sub-merchants".
Source: https://docs.paymongo.com/docs/account-settings-linked-accounts

There are two onboarding paths.
Invite sends a signup link to the Venue, who completes KYC on PayMongo's own pages.
Create-an-account runs the whole flow through our UI over the API.
Source: https://docs.paymongo.com/docs/onboarding-aas-onboarding-paths

The Create path is five calls:

| Step | Endpoint |
| --- | --- |
| Create account | `POST /v2/accounts` |
| Identity verification | `POST /v2/accounts/{id}/identity_verification` |
| Update account | `PATCH /v2/accounts/{id}` |
| Activate account | `POST /v2/accounts/{id}/activate` |
| Activation webhook | your registered endpoint |

Source: https://docs.paymongo.com/docs/onboarding-aas-quick-start

A `merchant` child needs KYC of the authorized representative and KYB of the business.
Activation provisions a Wallet plus QR Ph (P2M) payment acceptance.
Card and e-wallet capabilities beyond that are marked "Coming soon" for API-driven requests, so today they need a per-account request to PayMongo.
Source: https://docs.paymongo.com/docs/onboarding-aas-account-capabilities

"Onboarding-as-a-Service is available to every PayMongo account by default - no separate enablement step."
Source: https://docs.paymongo.com/docs/onboarding-as-a-service

After activation the parent transacts for the child with two headers:

```
Authorization: Basic <encoded_parent_secret_key>
Account-Id: org_childId
```

Checkout Sessions (Create V1 and V2, Retrieve, Expire) are on the supported resource list, alongside Payment Intents, Payments, Refunds, QRs, and Webhooks.
Source: https://docs.paymongo.com/docs/account-settings-linked-transactions

Funds settle to the child's own PayMongo account, because the transaction is attributed to the child.

The platform can take a cut without changing that.
`split_payment` carries a `transfer_to` and a `recipients` array of `{merchant_id, split_type, value}`.
The documented example transfers to the child and pays a fixed 1000 centavos to the parent.
Source: https://docs.paymongo.com/docs/account-settings-linked-transactions

The v2 Checkout Session request schema also carries `split_payment`, with `SplitPaymentDTO` and `SplitPaymentRecipientDTO` components.
Source: https://docs.paymongo.com/reference/create_checkout_sessions_2.md

One trap.
"Webhook events, such as `payment.paid`, are sent only to the child account's webhook endpoint, since the payment is attributed to that child account. They are not delivered to the parent account's webhooks."
The fix is to create the child's webhook with the same `Account-Id` header and point it at our own URL.
Source: https://docs.paymongo.com/docs/account-settings-linked-transactions

### Axis 2 - Fee pass-through

`pass_on_fees` is a boolean on `POST /v2/checkout_sessions`.
Source: https://docs.paymongo.com/reference/create_checkout_sessions_2.md

**The critical sub-question is settled. PayMongo auto-calculates.** Exact quote:

> "By default, PayMongo's transaction fee comes out of the amount you receive. Set `pass_on_fees: true` to add the fee on top of the total and charge it to the customer instead."

> "The fee varies by payment method, so the exact amount can't be known until the customer picks one. PayMongo handles this for you: when the customer selects a method on the checkout page, the displayed total updates to include that method's fee. This is one of the reasons `/v2` defers Payment Intent creation - the intent only needs to be created once the method (and therefore the fee) is known."

Source: https://docs.paymongo.com/docs/payment-channels-hosted-checkout

We do not compute a higher selling price.
We post the court rate, set the flag, and PayMongo adds the method's fee at selection time.

The "one payment method per Checkout Session when using pass-on fees" constraint is **not in the current docs**.
The official example on that same page sets `pass_on_fees: true` together with `"payment_method_types": ["card", "gcash", "qrph"]`.
The v2 schema puts `minItems: 1` on `payment_method_types` and states no maximum.
Treat the old constraint as stale until a test call proves otherwise.

Published rates, read 2026-08-18 from https://www.paymongo.com/pricing:

| Method | Rate |
| --- | --- |
| GCash | 2.23% |
| Maya | 1.79% |
| GrabPay | 1.96% |
| ShopeePay | 1.70% |
| QR Ph (online and in-store) | 1.34% |
| Cards, domestic Visa/Mastercard | 3.125% + PHP 13.39 |
| Cards, international Visa/Mastercard | 4.02% + PHP 13.39 |
| Direct online banking | 0.71% or PHP 13.39 |
| Payout / transfer | PHP 10 per transaction |
| Setup | free |
| One-time KYC | PHP 30.00 |

At a PHP 300 booking, QR Ph costs about PHP 4 and GCash about PHP 6.70.
Cards cost about PHP 22.75, which is 7.6% of the booking.

### Axis 3 - Hosted checkout and webhooks

`POST https://api.paymongo.com/v2/checkout_sessions`.
Required fields: `line_items` and `payment_method_types`.
The response carries `checkout_url`. Redirect the Player there.
Source: https://docs.paymongo.com/docs/payment-channels-hosted-checkout

The success event is `checkout_session.payment.paid`.
The payload carries the full session and the payment, including `reference_number`, `metadata`, and per-payment `amount`, `fee`, and `net_amount`.
Source: https://docs.paymongo.com/docs/payment-channels-hosted-checkout

Webhook verification:

> "PayMongo signs every webhook request using HMAC-SHA256 with a secret key tied to your endpoint. The signature is included in the `Paymongo-Signature` header of every request."

The documented Node example runs `createHmac("sha256", secret).update(rawBody).digest("hex")` and compares it to the header with `timingSafeEqual`, behind `express.raw({ type: "application/json" })`.
Source: https://docs.paymongo.com/docs/developer-tools-best-practices-1

Raw body is mandatory.
"Middleware that parses JSON before your verification step will alter the raw bytes and break signature checks."
Source: https://docs.paymongo.com/docs/developer-tools-best-practices

The signing secret is **per endpoint**: "Every webhook endpoint has a secret key."
Endpoints are also scoped to test or live mode.
Source: https://docs.paymongo.com/docs/developer-tools-webhooks-key-concepts

Under Linked Accounts each child gets its own webhook endpoint, so the secret is effectively per Venue - but we create and hold it, the Venue never sees it.

Expiring a held slot: `POST /checkout_sessions/{id}/expire`.
"Expiring a checkout session will cancel any associated payment intent if not already cancelled."
Source: https://docs.paymongo.com/reference/create_checkout_sessions_id_expire.md

That covers the 20-minute court hold.

### Axis 4 - Onboarding and KYC

> "Every PayMongo account receives four keys upon signup: two for test mode (sandbox) and two for live mode (production). Keys are available immediately - even before your account is fully activated."

Source: https://docs.paymongo.com/docs/account-settings-api-keys

We can start building today. Sign up, take `sk_test_`, integrate.

All Onboarding-aaS endpoints accept `sk_test_` keys and return mock data.
Source: https://docs.paymongo.com/docs/onboarding-as-a-service

Signup is email, OTP, then KYC by liveness check plus government ID.
Business verification (KYB) is a later, optional step that unlocks online payments and faster settlement.
Source: https://docs.paymongo.com/docs/get-started-create-your-account

Live documents for a Philippine sole proprietorship: DTI Certificate of Business Name Registration, government ID of the owner, BIR Form 2303.
A corporation needs SEC Certificate of Incorporation, Articles and By-Laws, latest GIS, government ID, BIR 2303, and a notarized Secretary's Certificate.
Source: https://docs.paymongo.com/docs/account-settings-philippine-entities

Clearing before payout:

| Method | Clearing period |
| --- | --- |
| Visa / Mastercard | 3 banking days |
| E-wallets (GCash, GrabPay, Maya, ShopeePay) | 2 banking days |
| BPI and UnionBank online banking | 1 banking day |
| QR Ph | 1 banking day |

Payouts generate daily at 09:00 PHT.
New accounts default to weekly on Wednesday; verified business accounts default to bi-weekly.
Daily is available on request to support.
Source: https://docs.paymongo.com/docs/money-movement-payouts

No minimum monthly fee is published.

## Xendit

### Axis 1 - Platform / sub-merchant: SUPPORTED

xenPlatform is the product.
"xenPlatform is a payment solution for platform businesses that need to manage funds for multiple merchants."
It lists creating sub-accounts, accepting payments on their behalf, splitting payments, and paying out to their bank accounts.
Source: https://docs.xendit.co/docs/xenplatform-overview

Sub-account creation offers two KYC routes.
The platform submits the Venue's documents itself, or the platform generates an invitation link and the Venue uploads its own documents.
Source: https://docs.xendit.co/docs/sub-accounts

`POST /v3/accounts` creates a sub-account.
For the Philippines, `identity.entity_type` accepts `CORPORATION`, `SOLE_PROPRIETORSHIP`, `PARTNERSHIP`, `INDIVIDUAL`, `ONE_PERSON_CORPORATION`.
Source: https://docs.xendit.co/apidocs/create-account-v3

Routing money uses the `for-user-id` header on the master key's request: "The XenPlatform subaccount user id that will perform this transaction."
Source: https://docs.xendit.co/apidocs/create-session

The platform cut uses Split Rules.
`POST https://api.xendit.co/split_rules` sets a `flat` or `percent` amount and a `destination_account_id`, and the rule attaches to a transaction with a `with-split-rule` header.
"Xendit will transfer the calculated Split Rule amount from the total transaction amount minus transaction fees."
A 100% split fails, because the fee cannot be deducted afterwards.
Source: https://docs.xendit.co/docs/split-payments

xenPlatform is not on by default.
Activation is a dashboard form asking the use case, payment licenses, merchant countries, and who is liable for chargebacks.
Source: https://docs.xendit.co/docs/activate-xenplatform

Fee attribution depends on the sub-account type.
Under direct deduction, transaction fees always come out of the account that receives the transaction.
Two extra platform charges apply: a per-monthly-active-sub-account fee, and an in-house transaction fee on transfers and splits (documented example: 0.5% of the split amount, not the transaction).
Source: https://docs.xendit.co/docs/xenplatform-fees

### Axis 2 - Fee pass-through

No `pass_on_fees` equivalent found in the Payments API, the Sessions API, or the fee docs.
The Xendit Help Center answer to "Can we charge Xendit's fee to our end customer?" states that the merchant sets the total amount including the Xendit fee on its own site, and that Xendit does not recommend the practice.
That article returned HTTP 403 to a direct fetch; the wording above came from the search-result snippet, not the page itself.
Source (snippet only): https://help.xendit.co/hc/en-us/articles/14267948153369-Can-we-charge-Xendit-s-fee-to-our-end-customer

Treat this as NOT SUPPORTED as an API feature. We would gross up ourselves.

Published Philippines rates, read 2026-08-18 from https://www.xendit.co/en-ph/pricing/:

| Method | Rate |
| --- | --- |
| GCash (e-wallet) | 3.00% + PHP 11.00 |
| GCash (auto debit) | 3.20% + PHP 11.00 |
| Maya | 2.00% + PHP 11.00 |
| GrabPay | 2.00% + PHP 11.00 |
| QRPH | 1.50%, minimum PHP 15.00, + PHP 11.00 |
| Cards, domestic | 3.50% + PHP 11.00 |
| Cards, international | 4.50% + PHP 10.00 + PHP 11.00 |
| BPI / RCBC / UBP direct debit | 1.30%, minimum PHP 15.00, + PHP 11.00 |
| Payout to bank or e-wallet | 1.00%, minimum PHP 15.00, + PHP 11.00 |
| Chargeback | USD 25.00 |

The PHP 11.00 line is the Xendit Processing Fee, charged on every attempt.
It hurts at our ticket size: on a PHP 300 QRPh booking the floor is PHP 15.00 + PHP 11.00 = PHP 26.00, which is 8.7%.

A **Minimum Monthly Fee of USD 50** applies. If accrued fees fall short, Xendit charges the difference.
Source: https://docs.xendit.co/docs/transaction-fees

### Axis 3 - Hosted checkout and webhooks

Payment Sessions in `PAYMENT_LINK` mode give a Xendit-hosted checkout page.
Source: https://docs.xendit.co/docs/how-payment-sessions-work

`POST https://api.xendit.co/sessions`.
Required body fields: `reference_id`, `currency`, `amount`, `country`, `session_type`, `mode`.
Optional headers: `for-user-id` and `with-split-rule`.
The response carries `payment_link_url` and `expires_at`.
Source: https://docs.xendit.co/apidocs/create-session

Session webhook events are `payment_session.completed` and `payment_session.expired`.
Source: https://docs.xendit.co/apidocs/webhook-notification-sent-defined-webhook-url-updates-payment-session

Verification is not a signature.
"Xendit can sign each webhook event that is sent to your endpoints. We do so by including a token in each event's `x-callback-token` header."
It is a static shared secret compared for equality, retrieved from the dashboard's Webhook settings.
No HMAC, no raw body requirement.
Source: https://docs.xendit.co/docs/handling-webhooks

For sub-accounts, the master account sets a webhook recipient of `MASTER_ACCOUNT` or `SUB_ACCOUNT` at creation time, so events for every Venue can land on our single endpoint under our own token.
Source: https://docs.xendit.co/docs/accepting-payments-for-sub-accounts

Releasing a held slot: `POST /sessions/{session_id}/cancel`.
"Cancels an ACTIVE Session. The Xendit Hosted Checkout URL will be invalid."
Source: https://docs.xendit.co/apidocs/cancel-session

### Axis 4 - Onboarding and KYC

Signup gives immediate Test Mode access.
"This will create your Xendit account and give you immediate access to our dashboard in Test Mode."
Business verification is the separate gate for Live Mode: "Once submitted, we will verify your details within 14 working days."
Source: https://docs.xendit.co/docs/create-account

Every account starts with public test and live keys and **zero secret keys**; you create secret keys yourself in the dashboard.
Source: https://docs.xendit.co/docs/api-keys

Sub-accounts can be created while the master account is still in Test Mode.
In Test Mode, `entity_type` must be `CORPORATION` and the country must match the master account.
Test sub-accounts are provisioned immediately with status `LIVE` but never go live for real.
Logging in to sub-accounts, activating them, and dashboard verification are all live-mode only.
Source: https://docs.xendit.co/docs/testing-xenplatform-features and https://docs.xendit.co/apidocs/create-account-v3

Philippine business documents live behind an Airtable embed on the docs page and did not render, so the exact document list is not captured here.
Source: https://docs.xendit.co/docs/philippines-business-documents

Settlement timing is per channel and not stated as a single T+N.
E-wallet, QR, direct debit, and PayLater settlement is counted in calendar days.
Source: https://docs.xendit.co/docs/settlements-overview

## Maya Business

### Axis 1 - Platform / sub-merchant: NOT SUPPORTED for Flow 1

Maya has no Connect-style model where each Venue holds its own merchant account under our platform.
What it has is Payment Facilitator mode on Maya Checkout.

"Transactions are processed under the PayFac's account but tagged with sub-merchant information for reporting, settlement, and compliance."
Source: https://developers.maya.ph/reference/accept-payments-as-a-payment-facilitator-in-maya-checkout

Enabling it is manual: contact your assigned Maya Relationship Manager.
There is no API that onboards a sub-merchant.
Instead every checkout request carries sub-merchant metadata: `subMerchantRequestReferenceNumber`, `pf.smi` (sub-merchant ID), `pf.smn` (name), `pf.mci` (city), `pf.mpc` (currency code), `pf.mco` (country code).
Source: https://developers.maya.ph/reference/accept-payments-as-a-payment-facilitator-in-maya-checkout

This inverts Flow 1.
Money lands in our account and we become responsible for paying each Venue, holding client funds, and the regulatory weight that comes with it.
That is a bigger problem than the BYO-keys design we are trying to remove.

The alternative on Maya is exactly the design we want to kill: each Venue signs up for its own Maya Business account and hands us its keys.

### Axis 2 - Fee pass-through

No `pass_on_fees` equivalent found in the Maya Checkout reference.
Status: UNCLEAR - no public doc found, not an explicit denial.

Published rates, read 2026-08-18 from https://www.maya.ph/business/pricing:

| Method | Rate |
| --- | --- |
| QRPh | 1.0% MDR |
| Maya QR | 1.50% MDR |
| GCash | 2% MDR |
| WeChat Pay | 1.75% MDR |
| ShopeePay | 1.85% MDR |
| Visa / Mastercard, online products | 3.50% MDR + PHP 10 per transaction |
| JCB / Amex, online products | 3.50% MDR + PHP 10 per transaction |
| Bancnet | 3.50% MDR, terminal only, not online |

Maya's QRPh rate of 1.0% is the lowest of the three.
Setup fee, monthly fee, minimum volume, and settlement timing are not published on that page.

### Axis 3 - Hosted checkout and webhooks

Maya Checkout is a hosted redirect page.

- Sandbox: `POST https://pg-sandbox.paymaya.com/checkout/v1/checkouts`
- Production: `POST https://pg.paymaya.com/checkout/v1/checkouts`

Auth is HTTP Basic with the **public** key as username and an empty password.
Required body: `totalAmount` (object with `value` and `currency`) and `requestReferenceNumber` (max 36 characters).
The response carries `checkoutId` and `redirectUrl`.
Source: https://developers.maya.ph/reference/createv1checkout

Webhook events: `PAYMENT_SUCCESS`, `PAYMENT_FAILED`, `PAYMENT_EXPIRED`, `PAYMENT_CANCELLED`, and `AUTHORIZED` for cards.
Webhooks register through Maya Manager or `POST /payments/v1/webhooks` with the secret key.
Source: https://developers.maya.ph/reference/configuring-your-webhook-for-maya-checkout

**There is no documented webhook signature.**
No signature header, no HMAC, no signing secret.
The page's security guidance is to restrict incoming traffic to Maya's official IP addresses.
For a multi-tenant platform this is a real downgrade: an IP allowlist cannot tell us which Venue a forged payload belongs to.

No expire or cancel endpoint for a pending checkout was found.
The reference states "Payments expire 1 hour from Creation and 15 mins from Authentication start."
That is longer than our 20-minute court hold and is not controllable from the API.

### Axis 4 - Onboarding and KYC

Maya is the fastest to start building against, and by a wide margin.
The docs publish shared sandbox keys anyone can use with no account at all.

> "If you do not have access to the Maya Business Manager, you may use the sandbox credentials listed below."

> "These sandbox credentials are for public use, and other users might be using them simultaneously."

Five sandbox parties are listed, for example `pk-Z0OSzLvIcOI2UIvDhdTGVVfRSSeiGStnceqwUE7n0Ah`.
Source: https://developers.maya.ph/reference/sandbox-credentials-and-cards

Live onboarding requires a Maya Business Manager account.
The required document list, approval time, settlement timing, and any minimum volume are not published on the pages read.
PayFac status additionally requires Relationship Manager approval.

## Confirmed vs unresolved

### Confirmed from primary docs

- PayMongo supports parent/child linked accounts and API-driven child onboarding. Five endpoints under `/v2/accounts`. https://docs.paymongo.com/docs/onboarding-aas-quick-start
- PayMongo's parent transacts for a child with `Account-Id: org_childId` plus the parent secret key, and Checkout Sessions v1/v2 create, retrieve, and expire are supported resources. https://docs.paymongo.com/docs/account-settings-linked-transactions
- PayMongo webhooks for a child go only to the child's endpoint, never the parent's.
- PayMongo `split_payment` lets the parent take a fixed or other-typed cut, and appears in the v2 Checkout Session schema.
- PayMongo `pass_on_fees: true` makes PayMongo add the method's fee on top and update the displayed total when the payer picks a method. The merchant does not gross up. https://docs.paymongo.com/docs/payment-channels-hosted-checkout
- PayMongo webhook signature is HMAC-SHA256 over the raw body, hex, in the `Paymongo-Signature` header, with a secret per endpoint.
- PayMongo `POST /checkout_sessions/{id}/expire` cancels the associated payment intent.
- PayMongo issues test and live keys at signup, before activation.
- Xendit xenPlatform supports sub-accounts, `for-user-id`, and Split Rules via `with-split-rule`.
- Xendit hosted checkout is `POST /sessions` in `PAYMENT_LINK` mode; `POST /sessions/{id}/cancel` invalidates it.
- Xendit webhook auth is a static `x-callback-token`, not a signature.
- Xendit charges a USD 50 minimum monthly fee.
- Maya's only multi-merchant model is PayFac, funds settle under the PayFac's account, sub-merchant details ride on each request, and enablement is manual.
- Maya publishes no webhook signature scheme and points to IP allowlisting instead.
- Maya publishes shared public sandbox keys usable with no account.

### Unresolved - do not build on these

1. **PayMongo child card and e-wallet capabilities.** Activation provisions Wallet and QR Ph (P2M) only. API-driven capability requests are marked "Coming soon". Whether a Venue child can accept GCash and cards today, and how long enabling that takes, is not stated. This is the single biggest open risk to the plan.
2. **PayMongo signature header format.** The documented Node example compares `Paymongo-Signature` directly against a bare hex digest. Real deliveries may use a compound value with timestamp and payload parts. Verify against a real test-mode delivery before writing the verifier.
3. **PayMongo pass-on-fees plus multiple payment methods.** The docs example combines `pass_on_fees: true` with three methods, and the schema states no maximum. The old "one method per session" constraint is not reproducible from current docs. Confirm with a live test call.
4. **PayMongo pass-on-fees under Linked Transactions.** Nothing states whether `pass_on_fees` behaves the same when the session is created with an `Account-Id` header, or whose fee schedule applies.
5. **PayMongo split_payment plus pass_on_fees together.** Interaction is undocumented.
6. **PayMongo Onboarding-aaS pricing.** No page states whether the parent pays anything per child account.
7. **PayMongo settlement destination for a child.** Payouts settle to the child's own wallet or bank by the child's schedule. Whether the parent can set or read that schedule over the API was not found.
8. **PayMongo multi-association and policy contracts.** Marked "Coming soon - early Q3 2026". Today the model is one parent per child. If a Venue already has a PayMongo account under another platform, linking may be blocked. Not stated either way.
9. **Xendit fee pass-through.** The only source is a search-result snippet of a Help Center article that returned HTTP 403. Not confirmed from a page we read.
10. **Xendit Philippine business document list.** Behind an Airtable embed that did not render.
11. **Xendit settlement T+N per channel.** The settlement page defers to the Available Payment Channels page, which was not read.
12. **Xendit owned vs managed sub-account distinction.** The fees page contrasts them, but no page read defines which type our Venues would be, or whether owned sub-accounts (which cannot create API keys) can still receive funds to their own bank.
13. **Xendit xenPlatform activation outcome.** The activation form asks about payment licenses. Whether a platform with no license is approved for "accept payments on behalf of merchants" is not stated.
14. **Maya settlement timing, live document list, approval time, monthly fees, minimum volume.** None published on the pages read.
15. **Maya fee pass-through.** No public doc found. Not an explicit denial.
16. **Maya checkout expiry control.** No API to expire early was found. Absence of a doc page is weak evidence, not proof.
17. **No test keys held for any provider.** Every claim above is doc-derived. Nothing in this note has been executed against a sandbox.

### Suggested next step

Sign up for PayMongo, take the `sk_test_` key issued at signup, and run three calls before any code is committed:

1. `POST /v2/accounts` with `type: merchant` and confirm a mock child comes back.
2. `POST /v2/checkout_sessions` with `Account-Id` set to that child, `pass_on_fees: true`, and three payment methods. This settles open items 1, 3, and 4 at once.
3. Register a webhook against the child, trigger a test payment, and log the exact `Paymongo-Signature` header. This settles open item 2.
