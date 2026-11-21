<?php
/**
 * Outbound command worker: WordPress polls the POS command queue.
 * Only explicitly supported, idempotent WooCommerce operations are executed.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class BDMPOS_Core_Worker {
	const HOOK = 'bdmpos_core_process_outbound_commands';
	const LOCK = 'bdmpos_core_worker_lock';

	public static function instance() {
		static $instance = null;
		if ( null === $instance ) {
			$instance = new self();
		}
		return $instance;
	}

	private function __construct() {
		add_filter( 'cron_schedules', array( $this, 'cron_schedules' ) );
		add_action( 'init', array( $this, 'schedule' ) );
		add_action( self::HOOK, array( $this, 'process' ) );
	}

	public function cron_schedules( $schedules ) {
		$schedules['bdmpos_every_minute'] = array(
			'interval' => 60,
			'display'  => 'BDM POS every minute',
		);
		return $schedules;
	}

	public function schedule() {
		if ( ! wp_next_scheduled( self::HOOK ) ) {
			wp_schedule_event( time() + 30, 'bdmpos_every_minute', self::HOOK );
		}
	}

	private function configured() {
		$url    = BDMPOS_Core_Settings::get( 'pos_command_url' );
		$secret = BDMPOS_Core_Settings::get( 'core_secret' );
		return 0 === strpos( $url, 'https://' ) && false === strpos( $url, 'YOUR-POS-DOMAIN' ) && strlen( $secret ) >= 32;
	}

	private function request( $method, $url, $body = null ) {
		if ( ! $this->configured() ) {
			return new WP_Error( 'bdmpos_worker_not_configured', 'Configureer eerst de POS-opdrachten-URL en Core API-secret.' );
		}
		$args = array(
			'method'      => $method,
			'timeout'     => 20,
			'redirection' => 0,
			'headers'     => array(
				'X-BDM-POS-Secret' => BDMPOS_Core_Settings::get( 'core_secret' ),
				'Accept'           => 'application/json',
				'Content-Type'     => 'application/json',
			),
		);
		if ( null !== $body ) {
			$args['body'] = wp_json_encode( $body );
		}
		return wp_remote_request( $url, $args );
	}

	private function execute( $command ) {
		if ( ! function_exists( 'wc_get_order' ) || ! class_exists( 'WC_Order' ) || ! is_array( $command ) || empty( $command['action'] ) ) {
			return new WP_Error( 'bdmpos_invalid_command', 'Ongeldige opdracht of WooCommerce niet beschikbaar.' );
		}
		$payload = isset( $command['payload'] ) && is_array( $command['payload'] ) ? $command['payload'] : array();
		switch ( $command['action'] ) {
			case 'order.complete':
				$order_id = isset( $payload['order_id'] ) ? absint( $payload['order_id'] ) : 0;
				$order    = $order_id ? wc_get_order( $order_id ) : false;
				if ( ! $order ) {
					return new WP_Error( 'bdmpos_order_not_found', 'Bestelling niet gevonden.' );
				}
				if ( ! $order->has_status( 'completed' ) ) {
					$note = isset( $payload['note'] ) ? sanitize_text_field( $payload['note'] ) : 'Afgerond via Bendemen POS.';
					$order->update_status( 'completed', $note, true );
				}
				$updated = wc_get_order( $order_id );
				return array( 'order_id' => $order_id, 'status' => $updated ? $updated->get_status() : 'completed' );

			case 'stock.set':
				$product_id = isset( $payload['product_id'] ) ? absint( $payload['product_id'] ) : 0;
				$product    = $product_id ? wc_get_product( $product_id ) : false;
				if ( ! $product || ! array_key_exists( 'quantity', $payload ) || ! is_numeric( $payload['quantity'] ) || (float) $payload['quantity'] < 0 ) {
					return new WP_Error( 'bdmpos_invalid_stock', 'Product en een geldige voorraadhoeveelheid zijn verplicht.' );
				}
				wc_update_product_stock( $product, (int) $payload['quantity'], 'set' );
				$updated = wc_get_product( $product_id );
				return array( 'product_id' => $product_id, 'stock_quantity' => $updated ? $updated->get_stock_quantity() : null );

			default:
				return new WP_Error( 'bdmpos_unsupported_command', 'Deze opdracht wordt niet ondersteund.' );
		}
	}

	public function process() {
		if ( ! $this->configured() || get_transient( self::LOCK ) ) {
			return;
		}
		set_transient( self::LOCK, 1, 50 );
		$last = array( 'at' => gmdate( 'c' ), 'success' => false, 'message' => 'Nog niet uitgevoerd.' );
		try {
			$url  = add_query_arg( 'action', 'pull', BDMPOS_Core_Settings::get( 'pos_command_url' ) );
			$pull = $this->request( 'GET', $url );
			if ( is_wp_error( $pull ) ) {
				throw new Exception( $pull->get_error_message() );
			}
			$code = (int) wp_remote_retrieve_response_code( $pull );
			if ( 200 !== $code ) {
				throw new Exception( 'POS pull gaf HTTP ' . $code . ' terug.' );
			}
			$data = json_decode( wp_remote_retrieve_body( $pull ), true );
			if ( ! is_array( $data ) || ! isset( $data['commands'] ) || ! is_array( $data['commands'] ) ) {
				throw new Exception( 'Ongeldig antwoord van de POS-opdrachtenwachtrij.' );
			}
			foreach ( $data['commands'] as $command ) {
				$result  = $this->execute( $command );
				$success = ! is_wp_error( $result );
				$ack     = array(
					'command_id' => isset( $command['command_id'] ) ? sanitize_text_field( $command['command_id'] ) : '',
					'success'    => $success,
					'result'     => $success ? $result : null,
					'error'      => $success ? '' : $result->get_error_message(),
				);
				if ( '' === $ack['command_id'] ) {
					continue;
				}
				$ack_response = $this->request( 'POST', add_query_arg( 'action', 'ack', BDMPOS_Core_Settings::get( 'pos_command_url' ) ), $ack );
				if ( is_wp_error( $ack_response ) || (int) wp_remote_retrieve_response_code( $ack_response ) < 200 || (int) wp_remote_retrieve_response_code( $ack_response ) >= 300 ) {
					throw new Exception( 'POS kon het opdrachtresultaat niet bevestigen.' );
				}
			}
			$last = array( 'at' => gmdate( 'c' ), 'success' => true, 'message' => 'Opdrachten opgehaald en verwerkt.' );
		} catch ( Throwable $error ) {
			$last = array( 'at' => gmdate( 'c' ), 'success' => false, 'message' => sanitize_text_field( $error->getMessage() ) );
		} finally {
			update_option( 'bdmpos_core_worker_last_run', $last, false );
			delete_transient( self::LOCK );
		}
	}
}
