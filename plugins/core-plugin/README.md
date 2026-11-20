# BDM POS Core

BDM POS Core is the authenticated server-to-server integration layer between Bendemen POS and WooCommerce. WooCommerce remains the source of truth; POS-specific rules remain in the POS application.

## API endpoints (v1)

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/wp-json/bdmpos/v1/health` | Authenticated connectivity and version |
| GET | `/wp-json/bdmpos/v1/catalog?page=1&per_page=100` | Products, categories, images, attributes and variations |
| GET | `/wp-json/bdmpos/v1/categories` | Product category tree |
| GET | `/wp-json/bdmpos/v1/customers?page=1&per_page=100` | Paginated customer directory; optional `search` |
| GET | `/wp-json/bdmpos/v1/customers/{id}/points` | Read a customer's points balance |
| POST | `/wp-json/bdmpos/v1/customers/{id}/points` | Audited manual points addition/removal |
| GET | `/wp-json/bdmpos/v1/stock?page=1&per_page=100` | Read-only stock snapshot for products and variations |
| GET | `/wp-json/bdmpos/v1/orders?page=1&per_page=50` | Paginated existing orders; optional `after`, `before`, `status` |
| POST | `/wp-json/bdmpos/v1/orders/{id}/complete` | Complete an existing order, including pickup completion |

The catalog returns assigned and primary category IDs, images, attributes, variation IDs and full variation details. The stock endpoint returns SKU, product/variation IDs, quantity, stock status, stock management and backorder fields. The orders endpoint serializes existing WooCommerce orders, line items, addresses, totals, dates, metadata and refunds.

## Controlled write boundaries

- **Stock:** read-only. Core never changes stock quantities or stock status.
- **Orders:** Core can complete an existing order. It cannot create, edit, cancel or refund orders. Order creation and other order changes remain in the existing POS Orders/checkout flow.
- **Pickup:** the existing pickup API continues validating pickup type and store ownership, then completes the order through Core.
- **Points:** Core can add or remove customer points through WooCommerce Points & Rewards. Each manual adjustment requires a non-empty reason and a unique `request_id`; repeated requests with the same ID are idempotent.
- **Checkout points:** existing order-linked earning and redemption remain in the established checkout/Orders flow. Completing an order triggers WooCommerce's normal status hooks.

## Install on bendemen.com

1. Copy this directory to `wp-content/plugins/bdmpos-core/`, or package it as a ZIP and upload it through WordPress Plugins.
2. Activate **BDM POS Core**.
3. Add a long random secret to `wp-config.php`:

```php
define( 'BDMPOS_CORE_SECRET', 'REPLACE_WITH_A_LONG_RANDOM_SECRET' );
```

4. Configure the same secret only in the POS server environment as `BDMPOS_CORE_SECRET`. Never expose it in browser code or a `NEXT_PUBLIC_` variable.
5. Configure `BDMPOS_CORE_URL` on the POS server and test the authenticated health endpoint over HTTPS.

All endpoints require the `X-BDM-POS-Secret` header. Missing configuration fails closed with HTTP 503; invalid credentials receive HTTP 401.

## Security

- Keep the secret out of Git, frontend JavaScript, browser storage and logs.
- Use HTTPS only and rotate the secret on both servers together.
- Points mutations use WooCommerce Points & Rewards ledger functions, a required audit note and an idempotency key.
- Order completion uses WooCommerce's normal status transition so configured completion hooks execute.
- Do not remove existing WooCommerce integrations until production behavior has been verified.

## Migration

Core routes are opt-in when both server-only environment variables are configured. Existing fallback behavior remains where applicable. Switch modules gradually and verify catalog, stock, order completion, pickup completion and points balances before removing legacy integrations.
