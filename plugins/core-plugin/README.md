# BDM POS Core

BDM POS Core is the server-to-server integration layer between the Bendemen POS application and WooCommerce.

It is intentionally a **thin bridge**, not a second business-logic system:
- WooCommerce remains the source of truth for products, categories, stock, customers and orders.
- POS-specific rules (branch permissions, exclusions, category priorities and checkout workflow) remain in the POS repository.
- The plugin exposes a small, versioned API and serializes WooCommerce objects into predictable responses.

## Current endpoints (v1)

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/wp-json/bdmpos/v1/health` | Authenticated connectivity and version check |
| GET | `/wp-json/bdmpos/v1/catalog?page=1&per_page=100` | Paginated products, including product category IDs and variation IDs |
| GET | `/wp-json/bdmpos/v1/categories` | Complete WooCommerce product-category tree |

The catalog endpoint returns product and variation IDs. Detailed variation records and write operations will be added in later migration steps before the POS switches away from the existing WooCommerce API.

## Install on bendemen.com

1. Copy this directory to `wp-content/plugins/bdmpos-core/` on the WordPress site, or package this directory as a ZIP and upload it through WordPress Plugins.
2. Activate **BDM POS Core**.
3. Add a long random secret to `wp-config.php`, above the “stop editing” line:

```php
define( 'BDMPOS_CORE_SECRET', 'REPLACE_WITH_A_LONG_RANDOM_SECRET' );
```

4. Configure the same secret only in the POS server's environment as `BDMPOS_CORE_SECRET`. Do not use a `NEXT_PUBLIC_` variable and never put it in browser code.
5. Test the authenticated health endpoint from the POS server over HTTPS.

Example:

```bash
curl -sS 'https://www.bendemen.com/wp-json/bdmpos/v1/health' \
  -H "X-BDM-POS-Secret: $BDMPOS_CORE_SECRET"
```

If the secret is absent, the plugin fails closed with HTTP 503. Invalid secrets receive HTTP 401.

## Security notes

- All endpoints require the dedicated server-to-server secret.
- Keep the secret out of Git, WordPress frontend JavaScript, browser storage and logs.
- Use HTTPS only.
- Rotate the secret on both servers together.
- Do not disable WooCommerce REST API keys or remove existing POS integrations until the replacement endpoints and all write paths have been migrated and verified.

## Migration plan

1. Install and test the plugin without changing existing POS traffic.
2. Migrate catalog reads and compare product counts, statuses, category assignments and variation IDs.
3. Add stock, customer, points, order and pickup endpoints with permission and idempotency checks.
4. Switch POS API routes one module at a time.
5. Remove legacy WooCommerce REST API usage only after production verification.
