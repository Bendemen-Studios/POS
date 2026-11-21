<?php
/**
 * Versioned REST adapter for Bendemen POS.
 *
 * This plugin deliberately acts as a transport/serialization layer. WooCommerce
 * remains the source of truth; POS business rules stay in the POS application.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class BDMPOS_Core_REST {
	const REST_NAMESPACE = 'bdmpos/v1';
	const MAX_PAGE_SIZE  = 100;

	/** @var self|null */
	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
		add_action( 'woocommerce_order_status_completed', array( $this, 'award_pos_order_points' ), 99, 1 );
	}

	public function register_routes() {
		register_rest_route(
			self::REST_NAMESPACE,
			'/woocommerce',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'proxy_woocommerce' ),
				'permission_callback' => array( $this, 'authenticate' ),
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/health',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'health' ),
				'permission_callback' => array( $this, 'authenticate' ),
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/catalog',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'catalog' ),
				'permission_callback' => array( $this, 'authenticate' ),
				'args'                => array(
					'page' => array(
						'default'           => 1,
						'sanitize_callback' => 'absint',
						'validate_callback' => static function ( $value ) {
							return (int) $value >= 1;
						},
					),
					'per_page' => array(
						'default'           => 100,
						'sanitize_callback' => 'absint',
						'validate_callback' => static function ( $value ) {
							return (int) $value >= 1 && (int) $value <= self::MAX_PAGE_SIZE;
						},
					),
				),
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/stock',
			array(
				'methods' => WP_REST_Server::READABLE,
				'callback' => array( $this, 'stock' ),
				'permission_callback' => array( $this, 'authenticate' ),
				'args' => array(
					'page' => array( 'default' => 1, 'sanitize_callback' => 'absint', 'validate_callback' => static function ( $value ) { return (int) $value >= 1; } ),
					'per_page' => array( 'default' => 100, 'sanitize_callback' => 'absint', 'validate_callback' => static function ( $value ) { return (int) $value >= 1 && (int) $value <= self::MAX_PAGE_SIZE; } ),
				),
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/orders',
			array(
				'methods' => WP_REST_Server::READABLE,
				'callback' => array( $this, 'orders' ),
				'permission_callback' => array( $this, 'authenticate' ),
				'args' => array(
					'page' => array( 'default' => 1, 'sanitize_callback' => 'absint', 'validate_callback' => static function ( $value ) { return (int) $value >= 1; } ),
					'per_page' => array( 'default' => 50, 'sanitize_callback' => 'absint', 'validate_callback' => static function ( $value ) { return (int) $value >= 1 && (int) $value <= self::MAX_PAGE_SIZE; } ),
					'after' => array( 'sanitize_callback' => 'sanitize_text_field' ),
					'before' => array( 'sanitize_callback' => 'sanitize_text_field' ),
					'status' => array( 'sanitize_callback' => 'sanitize_text_field' ),
				),
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/orders/(?P<id>\\d+)/complete',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'complete_order' ),
				'permission_callback' => array( $this, 'authenticate' ),
				'args'                => array(
					'id' => array( 'sanitize_callback' => 'absint', 'validate_callback' => static function ( $value ) { return (int) $value > 0; } ),
					'note' => array( 'sanitize_callback' => 'sanitize_text_field' ),
				),
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/customers',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'customers' ),
				'permission_callback' => array( $this, 'authenticate' ),
				'args'                => array(
					'page' => array(
						'default'           => 1,
						'sanitize_callback' => 'absint',
						'validate_callback' => static function ( $value ) { return (int) $value >= 1; },
					),
					'per_page' => array(
						'default'           => 100,
						'sanitize_callback' => 'absint',
						'validate_callback' => static function ( $value ) { return (int) $value >= 1 && (int) $value <= self::MAX_PAGE_SIZE; },
					),
					'search' => array(
						'sanitize_callback' => 'sanitize_text_field',
					),
				),
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/customers/(?P<id>\\d+)/points',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'customer_points' ),
				'permission_callback' => array( $this, 'authenticate' ),
				'args'                => array(
					'id' => array( 'sanitize_callback' => 'absint', 'validate_callback' => static function ( $value ) { return (int) $value > 0; } ),
				),
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/customers/(?P<id>\\d+)/points',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'mutate_customer_points' ),
				'permission_callback' => array( $this, 'authenticate' ),
				'args'                => array(
					'id'         => array( 'sanitize_callback' => 'absint', 'validate_callback' => static function ( $value ) { return (int) $value > 0; } ),
					'action'     => array( 'required' => true, 'sanitize_callback' => 'sanitize_key' ),
					'points'     => array( 'required' => true, 'sanitize_callback' => 'absint' ),
					'note'       => array( 'required' => true, 'sanitize_callback' => 'sanitize_text_field' ),
					'request_id' => array( 'required' => true, 'sanitize_callback' => 'sanitize_text_field' ),
				),
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/customers/(?P<id>\\d+)/points/transactions',
			array(
				'methods'              => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'customer_points_transaction' ),
				'permission_callback' => array( $this, 'authenticate' ),
				'args'                => array(
					'id'         => array( 'sanitize_callback' => 'absint', 'validate_callback' => static function ( $value ) { return (int) $value > 0; } ),
					'action'     => array( 'required' => true, 'sanitize_callback' => 'sanitize_key' ),
					'points'     => array( 'required' => true, 'sanitize_callback' => 'absint' ),
					'order_id'   => array( 'required' => true, 'sanitize_callback' => 'absint' ),
					'request_id' => array( 'required' => true, 'sanitize_callback' => 'sanitize_text_field' ),
				),
			)
		);



		register_rest_route(
			self::REST_NAMESPACE,
			'/categories',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'categories' ),
				'permission_callback' => array( $this, 'authenticate' ),
			)
		);
	}

	/**
	 * Authenticate server-to-server calls using a dedicated secret.
	 *
	 * Define BDMPOS_CORE_SECRET in wp-config.php and send it only from the
	 * POS server as X-BDM-POS-Secret. Never expose it in browser JavaScript.
	 */
	public function authenticate( WP_REST_Request $request ) {
		$core_secret = class_exists( 'BDMPOS_Core_Settings' ) ? BDMPOS_Core_Settings::get( 'core_secret' ) : ( defined( 'BDMPOS_CORE_SECRET' ) ? (string) BDMPOS_CORE_SECRET : '' );
		if ( '' === $core_secret ) {
			return new WP_Error(
				'bdmpos_core_not_configured',
				'BDM POS Core server authentication is not configured.',
				array( 'status' => 503 )
			);
		}

		$provided = (string) $request->get_header( 'x_bdm_pos_secret' );
		if ( '' === $provided || ! hash_equals( $core_secret, $provided ) ) {
			return new WP_Error(
				'bdmpos_core_forbidden',
				'Invalid BDM POS Core credentials.',
				array( 'status' => 401 )
			);
		}

		if ( ! class_exists( 'WooCommerce' ) || ! function_exists( 'wc_get_products' ) ) {
			return new WP_Error(
				'bdmpos_core_woocommerce_unavailable',
				'WooCommerce is not available.',
				array( 'status' => 503 )
			);
		}

		return true;
	}

	/**
	 * Authenticated server-side gateway to the complete WooCommerce wc/v3 REST API.
	 * Only the POS server can call this endpoint; WooCommerce's own REST
	 * controllers still validate the resource operation using a shop manager
	 * or administrator service account.
	 */
	public function proxy_woocommerce( WP_REST_Request $request ) {
		$method = strtoupper( sanitize_text_field( (string) $request->get_param( 'method' ) ) );
		$path = (string) $request->get_param( 'path' );
		$params = $request->get_param( 'params' );
		$body = $request->get_param( 'body' );
		$allowed_methods = array( 'GET', 'POST', 'PUT', 'PATCH', 'DELETE' );
		if ( ! in_array( $method, $allowed_methods, true ) || ! is_string( $path ) || ! preg_match( '#^/[a-zA-Z0-9_/-]+$#', $path ) || false !== strpos( $path, '..' ) ) {
			return new WP_Error( 'bdmpos_core_invalid_proxy_request', 'A valid WooCommerce wc/v3 path and HTTP method are required.', array( 'status' => 400 ) );
		}
		if ( ! is_array( $params ) ) { $params = array(); }
		if ( ! is_array( $body ) ) { $body = array(); }
		$request_id = sanitize_text_field( (string) $request->get_param( 'request_id' ) );
		$idempotency_option = '';
		if ( '' !== $request_id && in_array( $method, array( 'POST', 'PUT', 'PATCH', 'DELETE' ), true ) ) {
			$idempotency_option = 'bdmpos_core_idem_' . hash( 'sha256', $method . '|' . $path . '|' . $request_id );
			$stored = get_option( $idempotency_option, false );
			if ( is_array( $stored ) && isset( $stored['status'], $stored['data'] ) && 'complete' === $stored['status'] ) {
				$replay = rest_ensure_response( $stored['data'] );
				$replay->set_status( (int) $stored['http_status'] );
				foreach ( (array) $stored['headers'] as $header_name => $header_value ) { $replay->header( $header_name, $header_value ); }
				$replay->header( 'X-BDM-POS-Idempotent-Replay', 'true' );
				return $replay;
			}
			if ( is_array( $stored ) && isset( $stored['status'] ) && 'processing' === $stored['status'] ) {
				$created = isset( $stored['created_at'] ) ? (int) $stored['created_at'] : 0;
				if ( $created > 0 && ( time() - $created ) < 90 ) {
					return new WP_Error( 'bdmpos_core_request_processing', 'This request ID is already being processed or had an uncertain result. Do not retry with a new request ID.', array( 'status' => 409 ) );
				}
				delete_option( $idempotency_option );
			}
		}
		$service_users = get_users( array( 'role' => 'administrator', 'fields' => 'ID', 'number' => 20 ) );
		$service_user_id = 0;
		foreach ( $service_users as $candidate_id ) {
			if ( user_can( (int) $candidate_id, 'manage_woocommerce' ) && user_can( (int) $candidate_id, 'manage_options' ) ) {
				$service_user_id = (int) $candidate_id;
				break;
			}
		}
		if ( ! $service_user_id ) {
			return new WP_Error( 'bdmpos_core_service_user_missing', 'Create or enable a WordPress administrator account with WooCommerce management permissions for Core operations.', array( 'status' => 503 ) );
		}
		if ( '' !== $idempotency_option && ! add_option( $idempotency_option, array( 'status' => 'processing', 'created_at' => time() ), '', false ) ) {
			$stored = get_option( $idempotency_option, false );
			if ( is_array( $stored ) && isset( $stored['status'] ) && 'complete' === $stored['status'] ) {
				$replay = rest_ensure_response( $stored['data'] );
				$replay->set_status( (int) $stored['http_status'] );
				foreach ( (array) $stored['headers'] as $header_name => $header_value ) { $replay->header( $header_name, $header_value ); }
				$replay->header( 'X-BDM-POS-Idempotent-Replay', 'true' );
				return $replay;
			}
			$created = is_array( $stored ) && isset( $stored['created_at'] ) ? (int) $stored['created_at'] : 0;
			if ( $created > 0 && ( time() - $created ) >= 90 ) {
				delete_option( $idempotency_option );
				if ( ! add_option( $idempotency_option, array( 'status' => 'processing', 'created_at' => time() ), '', false ) ) {
					return new WP_Error( 'bdmpos_core_request_processing', 'This request ID is already being processed or had an uncertain result. Do not retry with a new request ID.', array( 'status' => 409 ) );
				}
			} else {
				return new WP_Error( 'bdmpos_core_request_processing', 'This request ID is already being processed or had an uncertain result. Do not retry with a new request ID.', array( 'status' => 409 ) );
			}
		}
		$previous_user_id = get_current_user_id();
		try {
			wp_set_current_user( $service_user_id );
			$internal = new WP_REST_Request( $method, '/wc/v3' . $path );
			$internal->set_query_params( $params );
			if ( in_array( $method, array( 'POST', 'PUT', 'PATCH' ), true ) ) {
				$internal->set_body_params( $body );
				$internal->set_json_params( $body );
				$internal->set_header( 'content-type', 'application/json' );
			}
			$response = rest_do_request( $internal );
			if ( is_wp_error( $response ) ) {
				return $response;
			}
			$status = $response instanceof WP_REST_Response ? $response->get_status() : 200;
			$data = $response instanceof WP_REST_Response ? $response->get_data() : $response;
			$headers = $response instanceof WP_REST_Response ? $response->get_headers() : array();
			$wrapped = rest_ensure_response( array( 'success' => $status >= 200 && $status < 300, 'data' => $data ) );
			$wrapped->set_status( $status );
			$replay_headers = array();
			foreach ( $headers as $header_name => $header_value ) {
				if ( in_array( strtolower( $header_name ), array( 'x-wp-total', 'x-wp-totalpages', 'link' ), true ) ) {
					$wrapped->header( $header_name, $header_value );
					$replay_headers[ $header_name ] = $header_value;
				}
			}
			if ( '' !== $idempotency_option && $status < 500 ) {
				update_option( $idempotency_option, array( 'status' => 'complete', 'http_status' => $status, 'data' => array( 'success' => $status >= 200 && $status < 300, 'data' => $data ), 'headers' => $replay_headers, 'completed_at' => time() ), false );
			}
			return $wrapped;
		} catch ( Throwable $error ) {
			return new WP_Error( 'bdmpos_core_proxy_failed', 'WooCommerce operation failed.', array( 'status' => 500, 'reason' => $error->getMessage() ) );
		} finally {
			wp_set_current_user( $previous_user_id );
		}
	}

	public function health() {
		return rest_ensure_response(
			array(
				'success'          => true,
				'service'          => 'bdmpos-core',
				'version'          => BDMPOS_CORE_VERSION,
				'woocommerce'      => defined( 'WC_VERSION' ) ? WC_VERSION : null,
				'wordpress'        => get_bloginfo( 'version' ),
				'server_time_utc'  => gmdate( 'c' ),
			)
		);
	}

	public function catalog( WP_REST_Request $request ) {
		$page     = max( 1, (int) $request->get_param( 'page' ) );
		$per_page = min( self::MAX_PAGE_SIZE, max( 1, (int) $request->get_param( 'per_page' ) ) );

		try {
			$query = wc_get_products(
				array(
					'status'  => array( 'publish', 'private' ),
					'limit'   => $per_page,
					'page'    => $page,
					'orderby' => 'menu_order ID',
					'order'   => 'ASC',
					'return'  => 'objects',
				)
			);

			$products = array();
			foreach ( $query as $product ) {
				if ( $product instanceof WC_Product ) {
					$products[] = $this->serialize_product( $product );
				}
			}

			return rest_ensure_response(
				array(
					'success'      => true,
					'page'         => $page,
					'per_page'     => $per_page,
					'count'        => count( $products ),
					'has_more'     => count( $products ) === $per_page,
					'products'     => $products,
					'generated_at' => gmdate( 'c' ),
				)
			);
		} catch ( Throwable $error ) {
			return new WP_Error(
				'bdmpos_core_catalog_failed',
				'Unable to load the WooCommerce product catalog.',
				array(
					'status' => 500,
					'reason' => current_user_can( 'manage_woocommerce' ) ? $error->getMessage() : 'catalog_query_failed',
				)
			);
		}
	}

	/**
	 * Read-only stock snapshot for products and their variations.
	 * This endpoint only reads WooCommerce stock fields; it has no write path.
	 */
	public function stock( WP_REST_Request $request ) {
		$page = max( 1, (int) $request->get_param( 'page' ) );
		$per_page = min( self::MAX_PAGE_SIZE, max( 1, (int) $request->get_param( 'per_page' ) ) );
		try {
			$products = wc_get_products( array(
				'status' => array( 'publish', 'private' ),
				'limit' => $per_page,
				'page' => $page,
				'orderby' => 'ID',
				'order' => 'ASC',
				'return' => 'objects',
			) );
			$items = array();
			foreach ( $products as $product ) {
				if ( ! $product instanceof WC_Product ) {
					continue;
				}
				$items[] = $this->serialize_stock_item( $product, 0 );
				if ( $product->is_type( 'variable' ) ) {
					foreach ( $product->get_children() as $variation_id ) {
						$variation = wc_get_product( $variation_id );
						if ( $variation instanceof WC_Product_Variation ) {
							$items[] = $this->serialize_stock_item( $variation, $product->get_id() );
						}
					}
				}
			}
			return rest_ensure_response( array(
				'success' => true,
				'page' => $page,
				'per_page' => $per_page,
				'count' => count( $items ),
				'has_more' => count( $products ) === $per_page,
				'items' => $items,
				'read_only' => true,
				'generated_at' => gmdate( 'c' ),
			) );
		} catch ( Throwable $error ) {
			return new WP_Error( 'bdmpos_core_stock_failed', 'Unable to load WooCommerce stock.', array( 'status' => 500 ) );
		}
	}

	private function serialize_stock_item( WC_Product $product, $parent_id ) {
		return array(
			'id' => $product->get_id(),
			'product_id' => $product->get_id(),
			'parent_id' => absint( $parent_id ),
			'sku' => $product->get_sku(),
			'name' => $product->get_name(),
			'type' => $product->get_type(),
			'manage_stock' => $product->managing_stock(),
			'stock_quantity' => $product->get_stock_quantity(),
			'stock_status' => $product->get_stock_status(),
			'in_stock' => $product->is_in_stock(),
			'backorders' => $product->get_backorders(),
			'backorders_allowed' => $product->backorders_allowed(),
			'low_stock_amount' => $product->get_low_stock_amount(),
		);
	}

	/**
	 * Read-only order synchronization. No order creation or status changes occur here.
	 */
	public function orders( WP_REST_Request $request ) {
		$page = max( 1, (int) $request->get_param( 'page' ) );
		$per_page = min( self::MAX_PAGE_SIZE, max( 1, (int) $request->get_param( 'per_page' ) ) );
		$args = array(
			'limit' => $per_page,
			'page' => $page,
			'orderby' => 'date',
			'order' => 'DESC',
			'return' => 'objects',
			'paginate' => true,
		);
		$status = sanitize_text_field( (string) $request->get_param( 'status' ) );
		if ( '' !== $status ) {
			$args['status'] = array( 'wc-' . preg_replace( '/^wc-/', '', $status ) );
		}
		$after = sanitize_text_field( (string) $request->get_param( 'after' ) );
		$before = sanitize_text_field( (string) $request->get_param( 'before' ) );
		if ( '' !== $after ) { $args['date_created'] = '>=' . $after; }
		if ( '' !== $before ) { $args['date_created'] = isset( $args['date_created'] ) ? array( $args['date_created'], '<=' . $before ) : '<=' . $before; }
		try {
			$query = wc_get_orders( $args );
			$orders = is_object( $query ) && isset( $query->orders ) ? $query->orders : array();
			$total = is_object( $query ) && isset( $query->total ) ? (int) $query->total : count( $orders );
			$items = array();
			foreach ( $orders as $order ) {
				if ( $order instanceof WC_Order ) { $items[] = $this->serialize_order( $order ); }
			}
			return rest_ensure_response( array(
				'success' => true,
				'page' => $page,
				'per_page' => $per_page,
				'total' => $total,
				'total_pages' => (int) ceil( $total / $per_page ),
				'count' => count( $items ),
				'orders' => $items,
				'read_only' => true,
				'generated_at' => gmdate( 'c' ),
			) );
		} catch ( Throwable $error ) {
			return new WP_Error( 'bdmpos_core_orders_failed', 'Unable to load WooCommerce orders.', array( 'status' => 500 ) );
		}
	}

	/**
	 * Complete an existing order after POS fulfillment or customer pickup.
	 * WooCommerce's normal status hooks run, including configured points hooks.
	 */
	public function complete_order( WP_REST_Request $request ) {
		$order_id = absint( $request->get_param( 'id' ) );
		$order = $order_id ? wc_get_order( $order_id ) : false;
		if ( ! $order ) {
			return new WP_Error( 'bdmpos_core_order_not_found', 'Order not found.', array( 'status' => 404 ) );
		}
		if ( $order->has_status( 'completed' ) ) {
			return rest_ensure_response( array( 'success' => true, 'order' => $this->serialize_order( $order ), 'already_completed' => true ) );
		}
		$note = sanitize_text_field( (string) $request->get_param( 'note' ) );
		$order->update_status( 'completed', $note ? $note : 'Completed via Bendemen POS Core.', true );
		$updated = wc_get_order( $order_id );
		if ( ! $updated || ! $updated->has_status( 'completed' ) ) {
			return new WP_Error( 'bdmpos_core_order_completion_failed', 'WooCommerce did not complete the order.', array( 'status' => 500 ) );
		}
		return rest_ensure_response( array( 'success' => true, 'order' => $this->serialize_order( $updated ), 'already_completed' => false ) );
	}

	private function serialize_order( WC_Order $order ) {
		$data = $order->get_data();
		foreach ( array( 'date_created', 'date_modified', 'date_completed', 'date_paid' ) as $date_key ) {
			$date = $order->{'get_' . $date_key}();
			$data[ $date_key ] = $date ? $date->date( 'c' ) : null;
		}
		$data['line_items'] = array();
		foreach ( $order->get_items( 'line_item' ) as $item ) {
			$data['line_items'][] = $item->get_data();
		}
		foreach ( array( 'shipping', 'fee', 'coupon', 'tax' ) as $item_type ) {
			$key = 'shipping' === $item_type ? 'shipping_lines' : ( 'fee' === $item_type ? 'fee_lines' : ( 'coupon' === $item_type ? 'coupon_lines' : 'tax_lines' ) );
			$data[ $key ] = array();
			foreach ( $order->get_items( $item_type ) as $item ) { $data[ $key ][] = $item->get_data(); }
		}
		$data['refunds'] = array();
		foreach ( $order->get_refunds() as $refund ) { $data['refunds'][] = $refund->get_data(); }
		$data['meta_data'] = array();
		foreach ( $order->get_meta_data() as $meta ) { $data['meta_data'][] = $meta->get_data(); }
		return $data;
	}

	/**
	 * Read-only customer directory. Customer creation and order-linked changes
	 * remain in the existing POS/Orders workflows.
	 */
	public function customers( WP_REST_Request $request ) {
		$page     = max( 1, (int) $request->get_param( 'page' ) );
		$per_page = min( self::MAX_PAGE_SIZE, max( 1, (int) $request->get_param( 'per_page' ) ) );
		$args     = array(
			'limit'   => $per_page,
			'page'    => $page,
			'orderby' => 'ID',
			'order'   => 'DESC',
			'return'  => 'objects',
		);
		$search = trim( (string) $request->get_param( 'search' ) );
		if ( '' !== $search ) {
			$args['search'] = '*' . $search . '*';
		}

		try {
			$query = wc_get_customers( array_merge( $args, array( 'paginate' => true ) ) );
			$customers = is_object( $query ) && isset( $query->customers ) ? $query->customers : array();
			$total = is_object( $query ) && isset( $query->total ) ? (int) $query->total : count( $customers );
			$items = array();
			foreach ( $customers as $customer ) {
				if ( $customer instanceof WC_Customer ) {
					$items[] = $this->serialize_customer( $customer );
				}
			}
			return rest_ensure_response(
				array(
					'success'       => true,
					'page'          => $page,
					'per_page'      => $per_page,
					'total'         => $total,
					'total_pages'   => (int) ceil( $total / $per_page ),
					'count'         => count( $items ),
					'customers'     => $items,
					'generated_at'  => gmdate( 'c' ),
				)
			);
		} catch ( Throwable $error ) {
			return new WP_Error(
				'bdmpos_core_customers_failed',
				'Unable to load WooCommerce customers.',
				array( 'status' => 500 )
			);
		}
	}

	/**
	 * Controlled customer points adjustment with a required audit note and
	 * idempotency key. The WooCommerce Points & Rewards ledger records each change.
	 */
	public function mutate_customer_points( WP_REST_Request $request ) {
		$customer_id = absint( $request->get_param( 'id' ) );
		$action = sanitize_key( $request->get_param( 'action' ) );
		$points = absint( $request->get_param( 'points' ) );
		$note = sanitize_text_field( (string) $request->get_param( 'note' ) );
		$request_id = sanitize_text_field( (string) $request->get_param( 'request_id' ) );
		if ( ! in_array( $action, array( 'add', 'remove' ), true ) || $points < 1 || $points > 1000000 || '' === $note || '' === $request_id ) {
			return new WP_Error( 'bdmpos_core_invalid_points_adjustment', 'Action, points, note and request_id are required. Points must be between 1 and 1000000.', array( 'status' => 400 ) );
		}
		if ( ! class_exists( 'WC_Points_Rewards_Manager' ) ) {
			return new WP_Error( 'bdmpos_core_points_unavailable', 'WooCommerce Points & Rewards is not active.', array( 'status' => 503 ) );
		}
		if ( ! get_userdata( $customer_id ) ) {
			return new WP_Error( 'bdmpos_core_customer_not_found', 'Customer not found.', array( 'status' => 404 ) );
		}
		$meta_key = '_bdmpos_core_points_' . hash( 'sha256', $request_id );
		$existing = get_user_meta( $customer_id, $meta_key, true );
		if ( is_array( $existing ) && isset( $existing['status'] ) && 'complete' === $existing['status'] ) {
			return rest_ensure_response( array_merge( $existing['response'], array( 'idempotent' => true ) ) );
		}
		if ( ! add_user_meta( $customer_id, $meta_key, array( 'status' => 'processing' ), true ) ) {
			return new WP_Error( 'bdmpos_core_points_processing', 'This points adjustment is already being processed.', array( 'status' => 409 ) );
		}
		try {
			$current_points = max( 0, (int) WC_Points_Rewards_Manager::get_users_points( $customer_id ) );
			if ( 'remove' === $action && $points > $current_points ) {
				delete_user_meta( $customer_id, $meta_key );
				return new WP_Error( 'bdmpos_core_insufficient_points', sprintf( 'Customer has %d points; cannot remove %d points.', $current_points, $points ), array( 'status' => 400 ) );
			}
			$event_type = 'bdm-pos-manual-' . $action;
			$event_data = array(
				'source' => 'bdmpos-core',
				'note' => $note,
				'request_id' => $request_id,
				'adjustment' => $action,
			);
			$result = 'add' === $action
				? WC_Points_Rewards_Manager::increase_points( $customer_id, $points, $event_type, $event_data )
				: WC_Points_Rewards_Manager::decrease_points( $customer_id, $points, $event_type, $event_data );
			if ( ! $result ) {
				throw new Exception( 'WooCommerce Points & Rewards rejected the points adjustment.' );
			}
			$response = array(
				'success' => true,
				'customer_id' => $customer_id,
				'action' => $action,
				'points_changed' => $points,
				'points_balance' => max( 0, (int) WC_Points_Rewards_Manager::get_users_points( $customer_id ) ),
				'request_id' => $request_id,
				'note' => $note,
			);
			update_user_meta( $customer_id, $meta_key, array( 'status' => 'complete', 'response' => $response ) );
			return rest_ensure_response( $response );
		} catch ( Throwable $error ) {
			delete_user_meta( $customer_id, $meta_key );
			return new WP_Error( 'bdmpos_core_points_adjustment_failed', $error->getMessage(), array( 'status' => 500 ) );
		}
	}

	/** Read-only customer points balance; no points can be earned or redeemed here. */
	public function customer_points( WP_REST_Request $request ) {
		$customer_id = absint( $request->get_param( 'id' ) );
		$customer = $customer_id ? wc_get_customer( $customer_id ) : false;
		if ( ! $customer ) {
			return new WP_Error( 'bdmpos_core_customer_not_found', 'Customer not found.', array( 'status' => 404 ) );
		}
		if ( ! class_exists( 'WC_Points_Rewards_Manager' ) ) {
			return new WP_Error( 'bdmpos_core_points_unavailable', 'WooCommerce Points & Rewards is not active.', array( 'status' => 503 ) );
		}
		return rest_ensure_response(
			array(
				'success'        => true,
				'customer_id'    => $customer_id,
				'points_balance' => max( 0, (int) WC_Points_Rewards_Manager::get_users_points( $customer_id ) ),
				'read_only'      => true,
			)
		);
	}

	/**
	 * Preserve the POS earning rule inside Core. Existing legacy bridge hooks
	 * remain safe because both use the same order metadata as an idempotency guard.
	 */
	public function award_pos_order_points( $order_id ) {
		if ( ! class_exists( 'WC_Points_Rewards_Manager' ) ) {
			return;
		}
		$order = wc_get_order( $order_id );
		if ( ! $order || 'true' !== (string) $order->get_meta( '_pos_direct_checkout', true ) ) {
			return;
		}
		$customer_id = absint( $order->get_customer_id() );
		$total       = (float) $order->get_total();
		if ( ! $customer_id || $total <= 0 ) {
			return;
		}
		$whole  = (int) floor( $total );
		$cents  = (int) round( ( $total - $whole ) * 100 );
		$target = $whole + ( $cents >= 51 ? 1 : 0 );
		if ( $target <= 0 ) {
			return;
		}
		$plugin_earned = max( 0, (int) $order->get_meta( '_wc_points_earned', true ) );
		$pos_awarded   = max( 0, (int) $order->get_meta( '_bdm_pos_points_awarded', true ) );
		$missing       = max( 0, $target - max( $plugin_earned, $pos_awarded ) );
		if ( $missing > 0 ) {
			$result = WC_Points_Rewards_Manager::increase_points(
				$customer_id,
				$missing,
				'bdm-pos-order-earned',
				array( 'source' => 'bendemen-pos', 'order_id' => absint( $order_id ), 'target_points' => $target, 'missing_points' => $missing ),
				absint( $order_id )
			);
			if ( ! $result ) {
				return;
			}
			$pos_awarded += $missing;
		}
		$order->update_meta_data( '_wc_points_earned', $target );
		$order->update_meta_data( '_bdm_pos_points_awarded', $pos_awarded );
		$order->update_meta_data( '_bdm_pos_points_source', 'bendemen-pos' );
		$order->save();
	}

	/**
	 * Apply order-linked points earning or redemption through the native
	 * WooCommerce Points & Rewards ledger. Both operations are order-idempotent.
	 */
	public function customer_points_transaction( WP_REST_Request $request ) {
		$customer_id = absint( $request->get_param( 'id' ) );
		$action      = sanitize_key( $request->get_param( 'action' ) );
		$points      = absint( $request->get_param( 'points' ) );
		$order_id    = absint( $request->get_param( 'order_id' ) );
		$request_id  = sanitize_text_field( (string) $request->get_param( 'request_id' ) );

		if ( ! in_array( $action, array( 'sync_earned', 'redeem' ), true ) || $points < 1 || $points > 1000000 || ! $order_id || '' === $request_id ) {
			return new WP_Error( 'bdmpos_core_invalid_points_transaction', 'A supported action, customer, points, order_id and request_id are required.', array( 'status' => 400 ) );
		}
		if ( ! class_exists( 'WC_Points_Rewards_Manager' ) ) {
			return new WP_Error( 'bdmpos_core_points_unavailable', 'WooCommerce Points & Rewards is not active.', array( 'status' => 503 ) );
		}
		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			return new WP_Error( 'bdmpos_core_order_not_found', 'WooCommerce order not found.', array( 'status' => 404 ) );
		}
		if ( (int) $order->get_customer_id() !== $customer_id ) {
			return new WP_Error( 'bdmpos_core_customer_mismatch', 'Order customer does not match the points customer.', array( 'status' => 400 ) );
		}

		$lock_key = '_bdmpos_core_points_tx_' . hash( 'sha256', $request_id );
		$existing = $order->get_meta( $lock_key, true );
		if ( is_array( $existing ) && isset( $existing['status'], $existing['response'] ) && 'complete' === $existing['status'] ) {
			return rest_ensure_response( array_merge( $existing['response'], array( 'idempotent' => true ) ) );
		}
		if ( '' !== $order->get_meta( $lock_key, true ) ) {
			return new WP_Error( 'bdmpos_core_points_processing', 'This points transaction is already being processed or has an uncertain result.', array( 'status' => 409 ) );
		}
		$order->update_meta_data( $lock_key, array( 'status' => 'processing' ) );
		$order->save();

		try {
			if ( 'sync_earned' === $action ) {
				$plugin_earned = max( 0, (int) $order->get_meta( '_wc_points_earned', true ) );
				$pos_awarded   = max( 0, (int) $order->get_meta( '_bdm_pos_points_awarded', true ) );
				$missing       = max( 0, $points - max( $plugin_earned, $pos_awarded ) );
				if ( $missing > 0 ) {
					$result = WC_Points_Rewards_Manager::increase_points(
						$customer_id,
						$missing,
						'bdm-pos-order-earned',
						array( 'source' => 'bendemen-pos', 'order_id' => $order_id, 'target_points' => $points, 'missing_points' => $missing, 'request_id' => $request_id ),
						$order_id
					);
					if ( ! $result ) {
						throw new Exception( 'WooCommerce Points & Rewards rejected the points increase.' );
					}
					$pos_awarded += $missing;
				}
				$order->update_meta_data( '_wc_points_earned', $points );
				$order->update_meta_data( '_bdm_pos_points_awarded', $pos_awarded );
				$order->update_meta_data( '_bdm_pos_points_source', 'bendemen-pos' );
				$response = array( 'success' => true, 'points_target' => $points, 'points_added' => $missing, 'points_plugin_already_earned' => $plugin_earned );
			} else {
				$already_redeemed = max( 0, (int) $order->get_meta( '_bdm_points_redeemed', true ) );
				if ( $already_redeemed > 0 ) {
					$response = array( 'success' => true, 'idempotent' => true, 'points_redeemed' => $already_redeemed );
				} else {
					$current_points = max( 0, (int) WC_Points_Rewards_Manager::get_users_points( $customer_id ) );
					if ( $points > $current_points ) {
						throw new DomainException( sprintf( 'Insufficient points. Customer has %d points, requested %d.', $current_points, $points ) );
					}
					$result = WC_Points_Rewards_Manager::decrease_points(
						$customer_id,
						$points,
						'bdm-pos-redeem',
						array( 'source' => 'bendemen-pos', 'order_id' => $order_id, 'points_redeemed' => $points, 'request_id' => $request_id ),
						$order_id
					);
					if ( ! $result ) {
						throw new Exception( 'WooCommerce Points & Rewards rejected the points deduction.' );
					}
					$order->update_meta_data( '_wc_points_redeemed', $points );
					$order->update_meta_data( '_bdm_points_redeemed', $points );
					$order->update_meta_data( '_bdm_points_source', 'woocommerce-points-and-rewards' );
					$response = array( 'success' => true, 'points_redeemed' => $points );
				}
			}
			$response['customer_id'] = $customer_id;
			$response['order_id'] = $order_id;
			$response['points_balance'] = max( 0, (int) WC_Points_Rewards_Manager::get_users_points( $customer_id ) );
			$order->update_meta_data( $lock_key, array( 'status' => 'complete', 'response' => $response ) );
			$order->save();
			return rest_ensure_response( $response );
		} catch ( DomainException $error ) {
			$order->delete_meta_data( $lock_key );
			$order->save();
			return new WP_Error( 'bdmpos_core_insufficient_points', $error->getMessage(), array( 'status' => 400 ) );
		} catch ( Throwable $error ) {
			// Keep the processing marker after an uncertain ledger result. A
			// retry with the same request ID must not deduct or award twice.
			return new WP_Error( 'bdmpos_core_points_transaction_failed', 'Points transaction failed or has an uncertain result. Do not retry with a new request ID.', array( 'status' => 500 ) );
		}
	}

	private function serialize_customer( WC_Customer $customer ) {
		$data = $customer->get_data();
		$data['date_created']  = $customer->get_date_created() ? $customer->get_date_created()->date( 'c' ) : null;
		$data['date_modified'] = $customer->get_date_modified() ? $customer->get_date_modified()->date( 'c' ) : null;
		$data['meta_data'] = array();
		$data['points_balance'] = null;

		foreach ( $customer->get_meta_data() as $meta ) {
			$meta_data = $meta->get_data();
			$key = isset( $meta_data['key'] ) ? (string) $meta_data['key'] : '';
			$value = isset( $meta_data['value'] ) ? $meta_data['value'] : null;
			$data['meta_data'][] = array(
				'id'    => isset( $meta_data['id'] ) ? (int) $meta_data['id'] : 0,
				'key'   => $key,
				'value' => $value,
			);
			if ( null === $data['points_balance'] && in_array( $key, array( 'wc_points_balance', '_wc_points_balance', 'points_balance', '_points_balance' ), true ) ) {
				$data['points_balance'] = max( 0, (int) $value );
			}
		}
		if ( class_exists( 'WC_Points_Rewards_Manager' ) ) {
			$data['points_balance'] = max( 0, (int) WC_Points_Rewards_Manager::get_users_points( $customer->get_id() ) );
		}
		return $data;
	}

	public function categories() {
		$terms = get_terms(
			array(
				'taxonomy'   => 'product_cat',
				'hide_empty' => false,
				'orderby'    => 'term_id',
				'order'      => 'ASC',
			)
		);

		if ( is_wp_error( $terms ) ) {
			return new WP_Error(
				'bdmpos_core_categories_failed',
				'Unable to load WooCommerce product categories.',
				array( 'status' => 500 )
			);
		}

		$categories = array();
		foreach ( $terms as $term ) {
			$categories[] = array(
				'id'     => (int) $term->term_id,
				'name'   => $term->name,
				'slug'   => $term->slug,
				'parent' => (int) $term->parent,
				'count'  => (int) $term->count,
			);
		}

		return rest_ensure_response(
			array(
				'success'    => true,
				'count'      => count( $categories ),
				'categories' => $categories,
			)
		);
	}

	private function serialize_product( WC_Product $product ) {
		$category_ids = $product->get_category_ids();
		$categories   = array();

		foreach ( $category_ids as $category_id ) {
			$term = get_term( $category_id, 'product_cat' );
			if ( $term && ! is_wp_error( $term ) ) {
				$categories[] = array(
					'id'   => (int) $term->term_id,
					'name' => $term->name,
					'slug' => $term->slug,
				);
			}
		}

		$images = array();
		foreach ( $product->get_gallery_image_ids() as $image_id ) {
			$image_url = wp_get_attachment_image_url( $image_id, 'full' );
			if ( $image_url ) {
				$images[] = array(
					'id'  => (int) $image_id,
					'src' => $image_url,
					'alt' => (string) get_post_meta( $image_id, '_wp_attachment_image_alt', true ),
				);
			}
		}

		$featured_id = $product->get_image_id();
		if ( $featured_id ) {
			$featured_url = wp_get_attachment_image_url( $featured_id, 'full' );
			if ( $featured_url ) {
				array_unshift(
					$images,
					array(
						'id'  => (int) $featured_id,
						'src' => $featured_url,
						'alt' => (string) get_post_meta( $featured_id, '_wp_attachment_image_alt', true ),
					)
				);
			}
		}

		$data = array(
			'id'             => $product->get_id(),
			'name'           => $product->get_name(),
			'status'         => $product->get_status(),
			'slug'           => $product->get_slug(),
			'menu_order'     => $product->get_menu_order(),
			'price'          => $product->get_price(),
			'regular_price'  => $product->get_regular_price(),
			'sale_price'     => $product->get_sale_price(),
			'stock_quantity' => $product->get_stock_quantity(),
			'in_stock'       => $product->is_in_stock(),
			'type'           => $product->get_type(),
			'categories'         => $categories,
			'primary_category_id' => $this->get_primary_category_id( $product, $category_ids ),
			'images'              => $images,
			'attributes'          => $this->serialize_attributes( $product ),
			'variations'          => array(),
			'variations_data'     => array(),
		);

		if ( $product->is_type( 'variable' ) ) {
			$data['variations']      = array_map( 'absint', $product->get_children() );
			$data['variations_data'] = $this->serialize_variations( $product );
		}

		return $data;
	}

	/** Return the SEO-selected primary category, falling back to the first assigned category. */
	private function get_primary_category_id( WC_Product $product, array $category_ids ) {
		$primary_id = absint( get_post_meta( $product->get_id(), '_yoast_wpseo_primary_product_cat', true ) );
		if ( ! $primary_id ) {
			$primary_id = absint( get_post_meta( $product->get_id(), 'rank_math_primary_product_cat', true ) );
		}
		if ( ! $primary_id ) {
			$primary_id = absint( get_post_meta( $product->get_id(), '_rank_math_primary_product_cat', true ) );
		}
		if ( $primary_id && in_array( $primary_id, array_map( 'absint', $category_ids ), true ) ) {
			return $primary_id;
		}
		return ! empty( $category_ids ) ? absint( reset( $category_ids ) ) : 0;
	}

	/** Serialize variation details so POS no longer needs separate wc/v3 variation calls. */
	private function serialize_variations( WC_Product $product ) {
		$variations = array();
		foreach ( $product->get_children() as $variation_id ) {
			$variation = wc_get_product( $variation_id );
			if ( ! $variation instanceof WC_Product_Variation ) {
				continue;
			}

			$attributes = array();
			foreach ( $variation->get_attributes() as $name => $option ) {
				$attributes[] = array(
					'name'   => wc_attribute_label( str_replace( 'attribute_', '', $name ) ),
					'option' => (string) $option,
				);
			}

			$variations[] = array(
				'id'             => $variation->get_id(),
				'variation_id'   => $variation->get_id(),
				'menu_order'     => $variation->get_menu_order(),
				'price'          => $variation->get_price(),
				'regular_price'  => $variation->get_regular_price(),
				'sale_price'     => $variation->get_sale_price(),
				'stock_quantity' => $variation->get_stock_quantity(),
				'in_stock'       => $variation->is_in_stock(),
				'attributes'     => $attributes,
			);
		}
		return $variations;
	}

	private function serialize_attributes( WC_Product $product ) {
		$attributes = array();
		foreach ( $product->get_attributes() as $attribute ) {
			if ( ! $attribute instanceof WC_Product_Attribute ) {
				continue;
			}

			$options = array();
			foreach ( $attribute->get_options() as $option ) {
				if ( $attribute->is_taxonomy() ) {
					$term = get_term( $option, $attribute->get_name() );
					$options[] = $term && ! is_wp_error( $term ) ? $term->name : (string) $option;
				} else {
					$options[] = (string) $option;
				}
			}

			$attributes[] = array(
				'id'        => (int) $attribute->get_id(),
				'name'      => wc_attribute_label( $attribute->get_name() ),
				'options'   => $options,
				'variation' => (bool) $attribute->get_variation(),
				'visible'   => (bool) $attribute->get_visible(),
			);
		}

		return $attributes;
	}
}
