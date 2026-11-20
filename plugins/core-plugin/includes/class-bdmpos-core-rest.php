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
		if ( ! defined( 'BDMPOS_CORE_SECRET' ) || ! is_string( BDMPOS_CORE_SECRET ) || '' === BDMPOS_CORE_SECRET ) {
			return new WP_Error(
				'bdmpos_core_not_configured',
				'BDM POS Core server authentication is not configured.',
				array( 'status' => 503 )
			);
		}

		$provided = (string) $request->get_header( 'x_bdm_pos_secret' );
		if ( '' === $provided || ! hash_equals( (string) BDMPOS_CORE_SECRET, $provided ) ) {
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
