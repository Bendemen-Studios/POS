<?php
/**
 * BDM POS Core – Outbound command worker for WPCode.
 *
 * Install as a PHP snippet, run everywhere. Configure the two constants below.
 * WordPress initiates all network requests; the POS server never calls the shop.
 *
 * Supported actions: order.create, order.complete, stock.set.
 * No arbitrary PHP, SQL, URL or WooCommerce REST paths are accepted.
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

if ( ! defined( 'BDMPOS_POS_COMMAND_URL' ) ) {
	define( 'BDMPOS_POS_COMMAND_URL', 'https://YOUR-POS-DOMAIN/api/core/commands' );
}
if ( ! defined( 'BDMPOS_POS_COMMAND_SECRET' ) ) {
	define( 'BDMPOS_POS_COMMAND_SECRET', 'REPLACE-WITH-THE-SAME-32-CHARACTER-OR-LONGER-SECRET' );
}

add_filter( 'cron_schedules', function( $schedules ) {
	$schedules['bdmpos_every_minute'] = array( 'interval' => 60, 'display' => 'BDM POS every minute' );
	return $schedules;
} );

add_action( 'init', function() {
	if ( ! wp_next_scheduled( 'bdmpos_core_process_outbound_commands' ) ) {
		wp_schedule_event( time() + 30, 'bdmpos_every_minute', 'bdmpos_core_process_outbound_commands' );
	}
} );

function bdmpos_core_command_request( $method, $url, $body = null ) {
	if ( strpos( BDMPOS_POS_COMMAND_URL, 'https://' ) !== 0 ||
		strpos( BDMPOS_POS_COMMAND_URL, 'YOUR-POS-DOMAIN' ) !== false ||
		strlen( BDMPOS_POS_COMMAND_SECRET ) < 32 ||
		strpos( BDMPOS_POS_COMMAND_SECRET, 'REPLACE-' ) === 0 ) {
		return new WP_Error( 'bdmpos_not_configured', 'BDM POS outbound worker is not configured.' );
	}
	$args = array(
		'method' => $method,
		'timeout' => 20,
		'redirection' => 0,
		'headers' => array(
			'X-BDM-POS-Secret' => BDMPOS_POS_COMMAND_SECRET,
			'Accept' => 'application/json',
			'Content-Type' => 'application/json',
		),
	);
	if ( null !== $body ) { $args['body'] = wp_json_encode( $body ); }
	return wp_remote_request( $url, $args );
}

function bdmpos_core_execute_command( $command ) {
	if ( ! function_exists( 'wc_get_order' ) || ! class_exists( 'WC_Order' ) ) {
		return new WP_Error( 'woocommerce_unavailable', 'WooCommerce is unavailable.' );
	}
	$payload = isset( $command['payload'] ) && is_array( $command['payload'] ) ? $command['payload'] : array();
	switch ( $command['action'] ) {
		case 'order.complete':
			$order_id = absint( $payload['order_id'] ?? 0 );
			$order = $order_id ? wc_get_order( $order_id ) : false;
			if ( ! $order ) { return new WP_Error( 'order_not_found', 'Order not found.' ); }
			if ( ! $order->has_status( 'completed' ) ) {
				$order->update_status( 'completed', sanitize_text_field( $payload['note'] ?? 'Completed via Bendemen POS.' ), true );
			}
			return array( 'order_id' => $order_id, 'status' => wc_get_order( $order_id )->get_status() );

		case 'stock.set':
			$product_id = absint( $payload['product_id'] ?? 0 );
			$product = $product_id ? wc_get_product( $product_id ) : false;
			if ( ! $product ) { return new WP_Error( 'product_not_found', 'Product or variation not found.' ); }
			if ( ! array_key_exists( 'quantity', $payload ) || ! is_numeric( $payload['quantity'] ) ) {
				return new WP_Error( 'invalid_quantity', 'A numeric stock quantity is required.' );
			}
			wc_update_product_stock( $product, max( 0, (int) $payload['quantity'] ), 'set' );
			$updated = wc_get_product( $product_id );
			return array( 'product_id' => $product_id, 'stock_quantity' => $updated ? $updated->get_stock_quantity() : null );

		case 'order.create':
			$request_id = sanitize_text_field( $payload['request_id'] ?? $command['command_id'] );
			$existing = wc_get_orders( array(
				'limit' => 1,
				'meta_key' => '_bdmpos_command_id',
				'meta_value' => $request_id,
				'return' => 'objects',
			) );
			if ( ! empty( $existing ) ) {
				return array( 'order_id' => $existing[0]->get_id(), 'status' => $existing[0]->get_status(), 'idempotent' => true );
			}
			$order = wc_create_order();
			if ( is_wp_error( $order ) ) { return $order; }
			foreach ( (array) ( $payload['line_items'] ?? array() ) as $line ) {
				$product_id = absint( $line['product_id'] ?? 0 );
				$quantity = max( 1, absint( $line['quantity'] ?? 1 ) );
				$product = $product_id ? wc_get_product( $product_id ) : false;
				if ( ! $product ) {
					$order->delete( true );
					return new WP_Error( 'invalid_product', 'A line item references an unknown product.' );
				}
				$order->add_product( $product, $quantity );
			}
			$order->update_meta_data( '_bdmpos_command_id', $request_id );
			$order->set_payment_method( sanitize_text_field( $payload['payment_method'] ?? 'pos_gateway' ) );
			$order->set_status( 'completed' );
			$order->calculate_totals();
			$order->save();
			return array( 'order_id' => $order->get_id(), 'status' => $order->get_status(), 'idempotent' => false );

		default:
			return new WP_Error( 'unsupported_action', 'Unsupported command action.' );
	}
}

add_action( 'bdmpos_core_process_outbound_commands', function() {
	$lock = 'bdmpos_core_worker_lock';
	if ( get_transient( $lock ) ) { return; }
	set_transient( $lock, 1, 50 );
	try {
		$pull = bdmpos_core_command_request( 'GET', add_query_arg( 'action', 'pull', BDMPOS_POS_COMMAND_URL ) );
		if ( is_wp_error( $pull ) || 200 !== wp_remote_retrieve_response_code( $pull ) ) { return; }
		$data = json_decode( wp_remote_retrieve_body( $pull ), true );
		foreach ( (array) ( $data['commands'] ?? array() ) as $command ) {
			$result = bdmpos_core_execute_command( $command );
			$success = ! is_wp_error( $result );
			$ack = array(
				'command_id' => sanitize_text_field( $command['command_id'] ?? '' ),
				'success' => $success,
				'result' => $success ? $result : null,
				'error' => $success ? '' : $result->get_error_message(),
			);
			bdmpos_core_command_request( 'POST', add_query_arg( 'action', 'ack', BDMPOS_POS_COMMAND_URL ), $ack );
		}
	} finally {
		delete_transient( $lock );
	}
} );
