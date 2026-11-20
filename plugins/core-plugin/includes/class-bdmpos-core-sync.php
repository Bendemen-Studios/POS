<?php
/**
 * WooCommerce change notifications for the Bendemen POS backend.
 *
 * Events are queued through Action Scheduler (bundled with WooCommerce) and
 * delivered with signed requests. Failed deliveries are retried automatically.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class BDMPOS_Core_Sync {
	const GROUP = 'bdmpos-core';
	const HOOK  = 'bdmpos_core_deliver_webhook';
	const MAX_ATTEMPTS = 6;

	/** @var self|null */
	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'woocommerce_new_product', array( $this, 'product_created' ), 10, 1 );
		add_action( 'woocommerce_update_product', array( $this, 'product_updated' ), 10, 1 );
		add_action( 'woocommerce_delete_product', array( $this, 'product_deleted' ), 10, 1 );
		add_action( 'woocommerce_new_product_variation', array( $this, 'variation_changed' ), 10, 1 );
		add_action( 'woocommerce_update_product_variation', array( $this, 'variation_changed' ), 10, 1 );
		add_action( 'woocommerce_delete_product_variation', array( $this, 'variation_changed' ), 10, 1 );
		add_action( 'woocommerce_product_set_stock', array( $this, 'stock_changed' ), 10, 1 );
		add_action( 'woocommerce_variation_set_stock', array( $this, 'stock_changed' ), 10, 1 );
		add_action( 'woocommerce_new_order', array( $this, 'order_changed' ), 10, 1 );
		add_action( 'woocommerce_update_order', array( $this, 'order_changed' ), 10, 1 );
		add_action( 'woocommerce_order_status_changed', array( $this, 'order_status_changed' ), 10, 4 );
		add_action( 'woocommerce_order_refunded', array( $this, 'order_refunded' ), 10, 2 );
		add_action( 'woocommerce_created_customer', array( $this, 'customer_changed' ), 10, 1 );
		add_action( 'profile_update', array( $this, 'customer_changed' ), 10, 1 );
		add_action( 'added_user_meta', array( $this, 'customer_meta_changed' ), 10, 3 );
		add_action( 'updated_user_meta', array( $this, 'customer_meta_changed' ), 10, 3 );
		add_action( 'deleted_user_meta', array( $this, 'customer_meta_changed' ), 10, 3 );
		add_action( 'created_product_cat', array( $this, 'category_changed' ), 10, 1 );
		add_action( 'edited_product_cat', array( $this, 'category_changed' ), 10, 1 );
		add_action( 'delete_product_cat', array( $this, 'category_changed' ), 10, 1 );
		add_action( self::HOOK, array( $this, 'deliver' ), 10, 2 );
	}

	public function product_created( $id ) { $this->queue( 'product.created', 'product', $id ); }
	public function product_updated( $id ) { $this->queue( 'product.updated', 'product', $id ); }
	public function product_deleted( $id ) { $this->queue( 'product.deleted', 'product', $id ); }
	public function variation_changed( $id ) { $this->queue( 'product.variation_changed', 'variation', $id ); }
	public function stock_changed( $product ) {
		if ( $product instanceof WC_Product ) {
			$this->queue( 'stock.updated', $product->is_type( 'variation' ) ? 'variation' : 'product', $product->get_id() );
		}
	}
	public function order_changed( $id ) { $this->queue( 'order.updated', 'order', $id ); }
	public function order_status_changed( $id, $from, $to, $order ) {
		$this->queue( 'order.status_changed', 'order', $id, array( 'from' => $from, 'to' => $to ) );
	}
	public function order_refunded( $order_id, $refund_id ) {
		$this->queue( 'order.refunded', 'order', $order_id, array( 'refund_id' => absint( $refund_id ) ) );
	}
	public function customer_changed( $id ) { $this->queue( 'customer.updated', 'customer', $id ); }
	public function customer_meta_changed( $meta_id, $user_id, $meta_key ) {
		$key = (string) $meta_key;
		if ( 0 === strpos( $key, 'billing_' ) || 0 === strpos( $key, 'shipping_' ) || in_array( $key, array( 'wc_points_balance', '_wc_points_balance' ), true ) ) {
			$this->queue( 'customer.meta_updated', 'customer', $user_id, array( 'meta_key' => sanitize_key( $key ) ) );
		}
	}
	public function category_changed( $id ) { $this->queue( 'category.updated', 'category', $id ); }

	private function configured() {
		return defined( 'BDMPOS_CORE_WEBHOOK_URL' ) && is_string( BDMPOS_CORE_WEBHOOK_URL )
			&& 0 === strpos( BDMPOS_CORE_WEBHOOK_URL, 'https://' )
			&& defined( 'BDMPOS_CORE_WEBHOOK_SECRET' ) && is_string( BDMPOS_CORE_WEBHOOK_SECRET )
			&& strlen( BDMPOS_CORE_WEBHOOK_SECRET ) >= 32;
	}

	private function queue( $event, $resource_type, $resource_id, $extra = array() ) {
		if ( ! $this->configured() ) {
			return;
		}
		$payload = array(
			'event_id'      => wp_generate_uuid4(),
			'event'         => sanitize_key( str_replace( '.', '_', $event ) ),
			'event_name'    => sanitize_text_field( $event ),
			'resource_type' => sanitize_key( $resource_type ),
			'resource_id'   => absint( $resource_id ),
			'occurred_at'   => gmdate( 'c' ),
			'source'        => 'woocommerce',
			'details'       => $extra,
		);

		if ( function_exists( 'as_enqueue_async_action' ) ) {
			as_enqueue_async_action( self::HOOK, array( $payload, 0 ), self::GROUP, false );
		} else {
			wp_schedule_single_event( time() + 5, self::HOOK, array( $payload, 0 ) );
		}
	}

	public function deliver( $payload, $attempt = 0 ) {
		if ( ! $this->configured() || ! is_array( $payload ) || empty( $payload['event_id'] ) ) {
			return;
		}
		$body = wp_json_encode( $payload );
		$signature = hash_hmac( 'sha256', $body, BDMPOS_CORE_WEBHOOK_SECRET );
		$response = wp_remote_post(
			BDMPOS_CORE_WEBHOOK_URL,
			array(
				'timeout'     => 15,
				'redirection' => 0,
				'blocking'    => true,
				'headers'     => array(
					'Content-Type'        => 'application/json',
					'X-BDM-POS-Event'     => $payload['event_id'],
					'X-BDM-POS-Signature' => 'sha256=' . $signature,
					'User-Agent'          => 'BDM-POS-Core/' . BDMPOS_CORE_VERSION,
				),
				'body'        => $body,
			)
		);

		$ok = ! is_wp_error( $response ) && (int) wp_remote_retrieve_response_code( $response ) >= 200 && (int) wp_remote_retrieve_response_code( $response ) < 300;
		update_option( 'bdmpos_core_sync_last_attempt', array(
			'event_id' => sanitize_text_field( $payload['event_id'] ),
			'event' => sanitize_text_field( $payload['event_name'] ),
			'at' => gmdate( 'c' ),
			'attempt' => (int) $attempt + 1,
			'success' => $ok,
			'http_status' => is_wp_error( $response ) ? 0 : (int) wp_remote_retrieve_response_code( $response ),
			'error' => is_wp_error( $response ) ? sanitize_text_field( $response->get_error_message() ) : ( $ok ? '' : 'Webhook endpoint returned a non-2xx response.' ),
		), false );

		if ( $ok ) {
			update_option( 'bdmpos_core_sync_last_success', gmdate( 'c' ), false );
			return;
		}

		if ( (int) $attempt + 1 >= self::MAX_ATTEMPTS ) {
			return;
		}

		$delays = array( 60, 300, 900, 3600, 21600 );
		$delay = $delays[ min( (int) $attempt, count( $delays ) - 1 ) ];
		if ( function_exists( 'as_schedule_single_action' ) ) {
			as_schedule_single_action( time() + $delay, self::HOOK, array( $payload, (int) $attempt + 1 ), self::GROUP, false );
		} else {
			wp_schedule_single_event( time() + $delay, self::HOOK, array( $payload, (int) $attempt + 1 ) );
		}
	}

	public function status() {
		$last_attempt = get_option( 'bdmpos_core_sync_last_attempt', array() );
		return rest_ensure_response( array(
			'success' => true,
			'webhooks_configured' => $this->configured(),
			'queue' => function_exists( 'as_enqueue_async_action' ) ? 'action-scheduler' : 'wp-cron-fallback',
			'last_attempt' => is_array( $last_attempt ) ? $last_attempt : array(),
			'last_success_at' => get_option( 'bdmpos_core_sync_last_success', null ),
			'checked_at' => gmdate( 'c' ),
		) );
	}
}
