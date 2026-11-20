# BDM POS Core

BDM POS Core is the authenticated server-to-server integration layer between Bendemen POS and WooCommerce. It centralizes WooCommerce transport while the POS application retains its existing business rules, permissions, checkout and order workflows.

## API endpoints (v1)

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/wp-json/bdmpos/v1/health` | Authenticated connectivity and version |
| POST | `/wp-json/bdmpos/v1/woocommerce` | Authenticated gateway to WooCommerce's full `wc/v3` REST API |
| GET | `/wp-json/bdmpos/v1/catalog?page=1&per_page=100` | Products, categories, images, attributes and variations |
| GET | `/wp-json/bdmpos/v1/categories` | Product category tree |
| GET | `/wp-json/bdmpos/v1/customers?page=1&per_page=100` | Paginated customer directory; optional `search` |
| GET | `/wp-json/bdmpos/v1/customers/{id}/points` | Read a customer's points balance |
| POST | `/wp-json/bdmpos/v1/customers/{id}/points` | Audited manual points addition/removal |
| GET | `/wp-json/bdmpos/v1/stock?page=1&per_page=100` | Read-only stock snapshot for products and variations |
| GET | `/wp-json/bdmpos/v1/orders?page=1&per_page=50` | Paginated existing orders |
| POST | `/wp-json/bdmpos/v1/orders/{id}/complete` | Complete an existing order, including pickup completion |

## Full WooCommerce access

The `/woocommerce` gateway forwards authenticated server-side requests to WooCommerce's native `/wp-json/wc/v3/` API. It supports `GET`, `POST`, `PUT`, `PATCH` and `DELETE` for WooCommerce REST resources, including products, variations, categories, customers, orders, refunds, coupons and other `wc/v3` resources. WooCommerce's own REST controllers validate each operation.

The gateway runs requests as a WordPress administrator service account with both `manage_options` and `manage_woocommerce`. Configure at least one active administrator account on the WordPress site. Requests are accepted only when the dedicated Core secret is valid. The secret must exist only on the POS server and in `wp-config.php`; it is never sent to browser code.

Core does not create a second order alongside the POS. Each existing POS order-creation flow makes its single order-creation request through the gateway. Offline order synchronization retains the existing POS idempotency claim and does not fall back to a direct WooCommerce request after a Core failure, avoiding an accidental second create after an uncertain response.

## Existing POS behavior

- Existing order creation, manual order creation and offline order synchronization now use Core when `BDMPOS_CORE_URL` and `BDMPOS_CORE_SECRET` are configured.
- Existing order status updates use Core; the pickup API continues to check pickup type and store assignment before completing an order.
- Catalog, category, customer, stock and order read adapters remain available.
- Manual points adjustments use WooCommerce Points & Rewards with an audit note and idempotency key. Checkout-linked earning/redemption remains in the existing order-linked flow.
- WooCommerce remains the source of truth. Store exclusions, category rules, POS permissions and checkout logic remain in the POS application.

## Install on bendemen.com

1. Copy this directory to `wp-content/plugins/bdmpos-core/`, or package it as a ZIP and upload it through WordPress Plugins.
2. Activate **BDM POS Core**.
3. Add a long random secret and ensure an administrator service account exists:

```php
define( 'BDMPOS_CORE_SECRET', 'REPLACE_WITH_A_LONG_RANDOM_SECRET' );
```

4. Configure `BDMPOS_CORE_URL=https://www.bendemen.com` and the same `BDMPOS_CORE_SECRET` only in the POS server environment.
5. Test the authenticated health endpoint over HTTPS.

All endpoints require `X-BDM-POS-Secret`. Missing configuration fails closed with HTTP 503; invalid credentials receive HTTP 401. The full WooCommerce gateway is server-to-server only and must never be exposed to frontend/browser clients.

## Security

- Keep the secret out of Git, frontend JavaScript, browser storage and logs.
- Use HTTPS only and rotate the secret on both servers together.
- The Core gateway is intentionally highly privileged. Protect the POS server environment and restrict access to the gateway secret.
- WooCommerce REST controllers continue to apply resource-specific permissions and validation.
- Do not remove existing WooCommerce integrations until production behavior has been verified.

## Migration

Core routing is opt-in when both server-only environment variables are configured. Existing fallback behavior remains where applicable. Switch modules gradually and verify order creation, offline retries, status updates, stock operations, customer operations and points balances before removing legacy integrations.
