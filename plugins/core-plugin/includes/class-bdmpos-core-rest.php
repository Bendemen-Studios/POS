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
		$request_id = substr( sanitize_text_field( (string) $request->get_param( 'request_id' ) ), 0, 128 );
		if ( 'POST' === $method && '/orders' === $path && '' === $request_id ) {
			return new WP_Error( 'bdmpos_core_order_request_id_required', 'A stable request_id is required for order creation.', array( 'status' => 400 ) );
		}
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

		// Recover an order after a timed-out/failed response before returning 409.
		// A lock is only reclaimed after five minutes and only after WooCommerce
		// successfully confirms that no order with this client request ID exists.
		if ( '' !== $idempotency_option ) {
			$stored = get_option( $idempotency_option, false );
			if ( is_array( $stored ) && isset( $stored['status'] ) && 'processing' === $stored['status'] ) {
				$created_at = isset( $stored['created_at'] ) ? absint( $stored['created_at'] ) : time();
				if ( time() - $created_at < 300 ) {
					return new WP_Error( 'bdmpos_core_request_processing', 'This request ID is already being processed. Retry the same request ID after the current request finishes.', array( 'status' => 409 ) );
				}
				$previous_user_id = get_current_user_id();
				try {
					wp_set_current_user( $service_user_id );
					$matches = wc_get_orders( array(
						'limit' => 1,
						'return' => 'objects',
						'meta_query' => array(
							array(
								'key' => '_pos_client_order_id',
							'value' => $request_id,
							'compare' => '=',
						),
						),
					) );
					if ( ! is_array( $matches ) ) {
						throw new RuntimeException( 'WooCommerce returned an invalid idempotency recovery query.' );
					}
					if ( ! empty( $matches ) && $matches[0] instanceof WC_Order ) {
						$recovery_request = new WP_REST_Request( 'GET', '/wc/v3/orders/' . $matches[0]->get_id() );
						$recovery_response = rest_do_request( $recovery_request );
						if ( is_wp_error( $recovery_response ) ) {
							throw new RuntimeException( $recovery_response->get_error_message() );
						}
						$recovery_status = $recovery_response instanceof WP_REST_Response ? $recovery_response->get_status() : 200;
						$recovery_data = $recovery_response instanceof WP_REST_Response ? $recovery_response->get_data() : $recovery_response;
						if ( $recovery_status < 200 || $recovery_status >= 300 || ! is_array( $recovery_data ) || empty( $recovery_data['id'] ) ) {
							throw new RuntimeException( 'WooCommerce could not serialize the existing order during idempotency recovery.' );
						}
						$replay_data = array( 'success' => true, 'data' => $recovery_data );
						update_option( $idempotency_option, array(
							'status' => 'complete',
							'http_status' => $recovery_status,
							'data' => $replay_data,
							'headers' => array(),
							'completed_at' => time(),
					), false );
						$replay = rest_ensure_response( $replay_data );
						$replay->set_status( $recovery_status );
						$replay->header( 'X-BDM-POS-Idempotent-Replay', 'true' );
						return $replay;
					}
					// The lookup completed successfully and found no matching order:
					// releasing this expired lock is safe; the same request ID can retry.
					delete_option( $idempotency_option );
				} catch ( Throwable $recovery_error ) {
					return new WP_Error( 'bdmpos_core_idempotency_recovery_failed', 'WooCommerce could not safely verify the previous order attempt. The request remains locked; retry with the same request ID.', array( 'status' => 503 ) );
				} finally {
					wp_set_current_user( $previous_user_id );
				}
			}
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
			return new WP_Error( 'bdmpos_core_request_processing', 'This request ID is already being processed or had an uncertain result. Do not retry with a new request ID.', array( 'status' => 409 ) );
		}
		$previous_user_id = get_current_user_id();
		try {
			wp_set_current_user( $service_user_id );
			$internal = new WP_REST_Request( $method, '/wc/v3' . $path );
			$internal->set_query_params( $params );
			if ( in_array( $method, array( 'POST', 'PUT', 'PATCH' ), true ) ) {
				// WP_REST_Request parses JSON lazily via get_json_params().
				// parse_json_params() is protected and must not be called here.
				$internal->set_body( wp_json_encode( $body ) );
				$internal->set_header( 'content-type', 'application/json' );
			}
			$response = rest_do_request( $internal );
			if ( is_wp_error( $response ) ) {
				// Log the upstream error code/message without request bodies, credentials,
				// customer data, or payment details.
				$error_data = $response->get_error_data();
				$error_status = is_array( $error_data ) && isset( $error_data['status'] ) ? absint( $error_data['status'] ) : 0;
				if ( function_exists( 'wc_get_logger' ) ) {
					wc_get_logger()->error(
						'WooCommerce REST proxy returned WP_Error: ' . $response->get_error_code() . ' - ' . $response->get_error_message(),
						array(
							'source' => 'bdmpos-core-proxy',
							'method' => $method,
							'path' => $path,
							'request_id_hash' => '' !== $request_id ? hash( 'sha256', $request_id ) : '',
						'http_status' => $error_status,
						'error_data_keys' => is_array( $error_data ) ? array_keys( $error_data ) : array(),
						)
					);
				}
				// Release only an explicit 4xx rejection. A WP_Error without a
				// definite client-error status may have an uncertain write result.
				if ( '' !== $idempotency_option && $error_status >= 400 && $error_status < 500 ) {
					delete_option( $idempotency_option );
				}
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
			if ( '' !== $idempotency_option ) {
				if ( $status >= 200 && $status < 300 ) {
					update_option( $idempotency_option, array( 'status' => 'complete', 'http_status' => $status, 'data' => array( 'success' => true, 'data' => $data ), 'headers' => $replay_headers, 'completed_at' => time() ), false );
				} elseif ( $status >= 400 && $status < 500 ) {
					// A definite 4xx response means the create was rejected.
					delete_option( $idempotency_option );
				}
				// Keep 5xx results marked as processing: the remote write may have succeeded.
			}
			return $wrapped;
		} catch ( Throwable $error ) {
			if ( function_exists( 'wc_get_logger' ) ) {
				wc_get_logger()->critical(
					'WooCommerce REST proxy exception: ' . get_class( $error ) . ' - ' . $error->getMessage(),
					array(
						'source' => 'bdmpos-core-proxy',
						'method' => $method,
						'path' => $path,
						'request_id_hash' => '' !== $request_id ? hash( 'sha256', $request_id ) : '',
					)
				);
			}
			return new WP_Error( 'bdmpos_core_proxy_failed', 'WooCommerce operation failed.', array( 'status' => 500 ) );
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
			$query_args = array_merge( $args, array( 'paginate' => true ) );

			// Some WooCommerce installations do not expose the wc_get_customers()
			// wrapper even though the underlying customer query class is available.
			if ( function_exists( 'wc_get_customers' ) ) {
				$query = wc_get_customers( $query_args );
				$customers = is_object( $query ) && isset( $query->customers )
					? $query->customers
					: ( is_array( $query ) ? $query : array() );
				$total = is_object( $query ) && isset( $query->total )
					? (int) $query->total
					: count( $customers );
			} elseif ( class_exists( 'WC_Customer_Query' ) ) {
				$customer_query = new WC_Customer_Query( $query_args );
				$customers = $customer_query->get_customers();
				$total = method_exists( $customer_query, 'get_total' )
					? (int) $customer_query->get_total()
					: count( $customers );
			} else {
				// Last-resort compatibility path: registered WordPress users with the
				// customer role are valid WooCommerce customer accounts. This avoids
				// exposing administrators, staff, subscribers, or arbitrary users.
				$user_args = array(
					'role'         => 'customer',
					'fields'       => 'ID',
					'number'       => $per_page,
					'paged'        => $page,
					'orderby'      => 'ID',
					'order'        => 'DESC',
					'count_total'  => true,
				);
				if ( '' !== $search ) {
					$user_args['search'] = '*' . esc_attr( $search ) . '*';
					$user_args['search_columns'] = array( 'user_login', 'user_email', 'display_name' );
				}
				$user_query = new WP_User_Query( $user_args );
				$user_ids = $user_query->get_results();
				$total = (int) $user_query->get_total();
				$customers = array();
				foreach ( $user_ids as $user_id ) {
					$customer = new WC_Customer( (int) $user_id );
					if ( $customer->get_id() ) {
						$customers[] = $customer;
					}
				}
				if ( function_exists( 'wc_get_logger' ) ) {
					wc_get_logger()->warning(
						'Customer directory used the WordPress customer-role fallback.',
						array( 'source' => 'bdmpos-core-customers', 'page' => $page, 'per_page' => $per_page )
					);
				}
			}

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
			if ( function_exists( 'wc_get_logger' ) ) {
				wc_get_logger()->error(
					'Customer query failed: ' . $error->getMessage(),
					array( 'source' => 'bdmpos-core-customers', 'page' => $page, 'per_page' => $per_page )
				);
			}
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