# BDM POS Core

BDM POS Core is the authenticated server-to-server integration layer between Bendemen POS and WooCommerce. WooCommerce remains the source of truth; the POS retains its business rules, permissions and checkout workflows.

## API endpoints (v1)

All endpoints require the `X-BDM-POS-Secret` header.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/wp-json/bdmpos/v1/health` | Authenticated connectivity and version |
| POST | `/wp-json/bdmpos/v1/woocommerce` | Authenticated gateway to WooCommerce `wc/v3` |
| GET | `/wp-json/bdmpos/v1/catalog` | Paginated products and variations |
| GET | `/wp-json/bdmpos/v1/categories` | Product categories |
| GET | `/wp-json/bdmpos/v1/customers` | Paginated customer directory |
| GET/POST | `/wp-json/bdmpos/v1/customers/{id}/points` | Read or make audited points adjustments |
| GET | `/wp-json/bdmpos/v1/stock` | Read-only stock snapshot |
| GET | `/wp-json/bdmpos/v1/orders` | Read-only order listing |
| POST | `/wp-json/bdmpos/v1/orders/{id}/complete` | Complete an existing order |

## WooCommerce gateway

The `/woocommerce` endpoint forwards server-side requests to WooCommerce's native `/wp-json/wc/v3/` API. It supports GET, POST, PUT, PATCH and DELETE for WooCommerce resources. WooCommerce's own REST controllers validate each operation.

The gateway uses a WordPress administrator service account with `manage_options` and `manage_woocommerce`. Configure at least one active administrator account on WordPress. The Core secret is never sent to browser code.

Mutating gateway requests should include a stable `request_id`. Core stores completed responses and replays them for retries with the same method, path and request ID. Concurrent or uncertain in-flight writes return HTTP 409; callers must reuse the same request ID when retrying and must not issue a new order-create request after an uncertain result.

## Install on bendemen.com

1. Copy this directory to `wp-content/plugins/bdmpos-core/`, or package it as a ZIP and upload it through WordPress Plugins.
2. Activate **BDM POS Core**.
3. Add a long random secret in `wp-config.php`:

```php
define( 'BDMPOS_CORE_SECRET', 'REPLACE_WITH_A_LONG_RANDOM_SECRET' );
```

4. Configure `BDMPOS_CORE_URL=https://www.bendemen.com` and the same `BDMPOS_CORE_SECRET` only in the POS server environment.
5. Test the authenticated health endpoint over HTTPS.

## Security

- Keep the secret out of Git, frontend JavaScript, browser storage and logs.
- Use HTTPS only and rotate the secret on both servers together.
- Protect the POS server environment and restrict access to the gateway secret.
- The full WooCommerce gateway is highly privileged and server-to-server only.
- Do not remove existing WooCommerce integrations until order creation, retries, order status updates, stock, customer and points operations have been verified.
