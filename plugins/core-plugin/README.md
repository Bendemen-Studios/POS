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
| GET | `/wp-json/bdmpos/v1/customers?page=1&per_page=100` | Paginated, read-only customer directory; optional `search` |
| GET | `/wp-json/bdmpos/v1/customers/{id}/points` | Read-only WooCommerce Points & Rewards balance |\n| GET | `/wp-json/bdmpos/v1/stock?page=1&per_page=100` | Paginated read-only stock snapshot for products and variations |\n| GET | `/wp-json/bdmpos/v1/orders?page=1&per_page=50` | Paginated read-only order sync; optional `after`, `before` and `status` filters |

The catalog endpoint returns product records with assigned category IDs, the selected primary category, image and attribute data, variation IDs, and full variation details (`variations_data`), including their current stock fields. The stock endpoint provides a dedicated paginated snapshot with SKU, parent/variation IDs, quantity, stock status, stock management and backorder fields. The orders endpoint serializes existing WooCommerce orders, line items, addresses, totals, dates, metadata and refunds for read-only POS synchronization. Category records include their parent IDs so the POS can build the complete hierarchy. Results are paginated (maximum 100 products per page). The POS still applies branch-specific exclusions and category rules; those rules do not alter WooCommerce data.

The catalog contract is now sufficient to replace the POS's separate WooCommerce product-variation reads. The next migration step is to add a server-side POS adapter that calls these endpoints with `BDMPOS_CORE_SECRET`, then compare the resulting catalog against the current WooCommerce REST API before switching production traffic.

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

## Read-only boundaries\n\n- Core may read and synchronize current stock quantities/statuses and existing WooCommerce orders.\n- Core has no stock write, order creation, order update, order completion or order cancellation endpoint.\n- Existing POS Orders/checkout workflows remain responsible for all order writes and order-linked points processing.\n- Existing inventory workflows remain responsible for all stock mutations.\n\n## Security notes

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


## Explicit scope boundaries

BDM POS Core exposes customer and points **reads only**. It does not create or update customers, create orders, change order statuses, or mutate stock. Existing POS Orders and checkout flows remain responsible for order processing and any order-linked points earning/redemption. Stock operations are intentionally outside this Core migration.
