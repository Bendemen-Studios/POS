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
| POST | `/wp-json/bdmpos/v1/customers/{id}/points/transactions` | Idempotent order-linked points earning/redemption |
| GET | `/wp-json/bdmpos/v1/stock?page=1&per_page=100` | Read-only stock snapshot for products and variations |
| GET | `/wp-json/bdmpos/v1/orders?page=1&per_page=50` | Paginated existing orders |
| POST | `/wp-json/bdmpos/v1/orders/{id}/complete` | Complete an existing order, including pickup completion |

## Full WooCommerce access

The `/woocommerce` gateway forwards authenticated server-side requests to WooCommerce's native `/wp-json/wc/v3/` API. It supports `GET`, `POST`, `PUT`, `PATCH` and `DELETE` for WooCommerce REST resources, including products, variations, categories, customers, orders, refunds, coupons and other `wc/v3` resources. WooCommerce's own REST controllers validate each operation.

The gateway runs requests as a WordPress administrator service account with both `manage_options` and `manage_woocommerce`. Configure at least one active administrator account on the WordPress site. Requests are accepted only when the dedicated Core secret is valid. Enter the Core API secret in WooCommerce → BDM POS Core (or define it in `wp-config.php`); it is never sent to browser code.

Core does not create a second order alongside the POS. Each existing POS order-creation flow makes its single order-creation request through the gateway. Offline order synchronization retains the existing POS idempotency claim and does not fall back to a direct WooCommerce request after a Core failure, avoiding an accidental second create after an uncertain response.

## Duplicate request protection

Mutating requests through the full `/woocommerce` gateway can include a stable `request_id` (the POS helper sends it as `requestId`). Core stores the completed response and replays it for repeated requests with the same method, resource path and request ID. Concurrent or uncertain in-flight requests return HTTP 409 instead of creating a second resource. Standard and manual order endpoints forward an `Idempotency-Key` when the caller supplies one; offline order sync always forwards its stable client order ID and keeps its MySQL idempotency lock as an additional layer. A caller should always reuse the same key when retrying the same write.

## Existing POS behavior

- Existing order creation, manual order creation and offline order synchronization now use Core when `BDMPOS_CORE_URL` and `BDMPOS_CORE_SECRET` are configured.
- Existing order status updates use Core; the pickup API continues to check pickup type and store assignment before completing an order.
- Catalog, category, customer, stock and order read adapters remain available.
- Manual points adjustments and order-linked earning/redemption use WooCommerce Points & Rewards through Core. POS earning remains 1 point per full euro, plus 1 point when cents are 51–99. Earn/redeem operations are linked to the WooCommerce order and use stable request IDs and order metadata for idempotency. Core awards points for completed orders marked `_pos_direct_checkout=true`.
- WooCommerce remains the source of truth. Store exclusions, category rules, POS permissions and checkout logic remain in the POS application.

## Install on bendemen.com

1. Copy this directory to `wp-content/plugins/bdmpos-core/`, or package it as a ZIP and upload it through WordPress Plugins.
2. Activate **BDM POS Core**.
3. Add a long random secret and ensure an administrator service account exists:

```php
define( 'BDMPOS_CORE_SECRET', 'REPLACE_WITH_A_LONG_RANDOM_SECRET' );
```

4. Configure `BDMPOS_CORE_URL=https://www.bendemen.com` and the same `BDMPOS_CORE_SECRET` only in the POS server environment.
5. Configure the POS command queue URL under WooCommerce → BDM POS Core if outbound commands are used.
6. Test the authenticated health endpoint over HTTPS.

All endpoints require `X-BDM-POS-Secret`. Missing configuration fails closed with HTTP 503; invalid credentials receive HTTP 401. The full WooCommerce gateway is server-to-server only and must never be exposed to frontend/browser clients.

## Security

- Keep the secret out of Git, frontend JavaScript, browser storage and logs.
- Use HTTPS only and rotate the secret on both servers together.
- The Core gateway is intentionally highly privileged. Protect the POS server environment and restrict access to the gateway secret.
- WooCommerce REST controllers continue to apply resource-specific permissions and validation.
- Do not remove existing WooCommerce integrations until production behavior has been verified.

## Migration

Core routing is opt-in when both server-only environment variables are configured. Pickup order reads and completion require Core and no longer fall back to direct WooCommerce credentials. POS-side pickup/store authorization and offline pickup queue remain in the POS application. Order-linked points balance/earning/redemption and manual adjustments use Core when configured. The legacy WPCode Points & Rewards bridge must be deactivated after Core 0.9.0 is installed and verified; do not run both earning hooks unless relying on their shared metadata guard during the transition. Verify order creation, offline retries, pickup actions, points balances, earning and redemption before removing remaining legacy integrations.

## Reverse Core API bridge (0.12.0)

The POS host cannot open outbound TCP connections to bendemen.com in this deployment. Core API calls from the POS server are therefore transported through the existing authenticated command queue:

1. The POS server inserts a `core.request` command into its local `pos_core_commands` table.
2. WordPress polls the POS command endpoint over HTTPS every 15 seconds (WP-Cron), using the configured Core API secret.
3. The plugin executes the requested internal `/bdmpos/v1/*` REST route inside WordPress with the Core secret attached to the internal request.
4. WordPress acknowledges the command with the HTTP status and response data. The POS server waits for that acknowledgement and returns the original Core response to its caller.

Only routes inside the `/bdmpos/v1/` namespace are accepted by the worker. The queue remains authenticated, claims are atomic, and the worker never creates WooCommerce orders. Existing `order.complete` and `stock.set` commands remain supported.

The worker is scheduled at 15-second intervals through WP-Cron. As with all WP-Cron events, execution is traffic-triggered unless the site has a real system cron configured to call `wp-cron.php`. Requests waiting for a bridge response time out safely; an already queued command is not silently re-enqueued by the transport helper.
