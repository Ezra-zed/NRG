# ENRG payments API

All payment endpoints use the existing ENRG customer authentication: an active access JWT in `Authorization: Bearer …` or the secure `nrg_session` cookie. The browser and Expo app use the same API.

## Configure Razorpay

Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` on the backend. Use Razorpay Test Mode credentials in development. The key secret and webhook secret must never be included in either client app. Configure the Razorpay webhook URL as `https://<api-host>/api/payments/webhook` and subscribe to `payment.captured`, `payment.failed`, and `order.paid`.

## Start checkout

`POST /api/payments/orders` with `Idempotency-Key: <unique client-generated key>` and JSON `{ "projectId": "…", "quoteId": "…" }`. The backend requires the signed-in customer to own the project and have an accepted quote; it reads the price from that quote. The response includes a public `checkout.keyId`, `checkout.orderId`, amount in paise, currency, and an ENRG payment ID. Open Razorpay Checkout with those values.

After Checkout returns, call `POST /api/payments/verify` with `{ "paymentId": "<ENRG payment id>", "orderId": "<Razorpay order id>", "razorpayPaymentId": "<Razorpay payment id>", "razorpaySignature": "<Checkout signature>" }`. Verification checks the HMAC on the backend and queries Razorpay to confirm amount, currency, order, and capture status. A successful client callback alone does not mark payment paid.

If the customer closes Checkout, `POST /api/payments/cancel` with `{ "paymentId": "…" }` records the dismissal as cancelled. It is an informational signal only; a later signed Razorpay webhook can still update the payment to paid. `GET /api/payments/:paymentId` returns the authenticated customer's current status. Unsettled payments older than 24 hours are reported as interrupted; a later valid capture event can still settle them.

Webhook requests are verified against the exact raw request body before processing. Repeated events and duplicate client requests are safe to retry. Only one active order or successful payment is allowed per project quote.

## Test-mode validation

The repository tests cover quote amount conversion, Checkout signature validation, and raw-body webhook signature validation without contacting Razorpay. A full provider lifecycle run (real test checkout, provider failure/cancellation, and Razorpay-delivered webhook) requires test credentials and a webhook-reachable API URL; none are configured in the current workspace.
