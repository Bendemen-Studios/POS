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
		$schedules['bdmpos_every_15_seconds'] = array(
			'interval' => 15,
			'display'  => 'BDM POS every 15 seconds',
		);
		return $schedules;
	}

	public function schedule() {
		if ( 2 !== (int) get_option( 'bdmpos_core_worker_schedule_version', 0 ) ) {
			wp_clear_scheduled_hook( self::HOOK );
			wp_schedule_event( time() + 10, 'bdmpos_every_15_seconds', self::HOOK );
			update_option( 'bdmpos_core_worker_schedule_version', 2, false );
		} elseif ( ! wp_next_scheduled( self::HOOK ) ) {
			wp_schedule_event( time() + 10, 'bdmpos_every_15_seconds', self::HOOK );
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

	private function command_payload( $command ) {
		$payload = isset( $command['payload'] ) ? $command['payload'] : array();
		if ( is_string( $payload ) ) {
			$decoded = json_decode( $payload, true );
			$payload = is_array( $decoded ) ? $decoded : array();
		}
		return is_array( $payload ) ? $payload : array();
	}

	private function execute( $command ) {
		if ( ! function_exists( 'wc_get_order' ) || ! class_exists( 'WC_Order' ) || ! is_array( $command ) || empty( $command['action'] ) ) {
			return new WP_Error( 'bdmpos_invalid_command', 'Ongeldige opdracht of WooCommerce niet beschikbaar.' );
		}
		$payload = $this->command_payload( $command );
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

			case 'core.request':
				$method = isset( $payload['method'] ) ? strtoupper( sanitize_text_field( $payload['method'] ) ) : 'GET';
				$route = isset( $payload['route'] ) ? (string) $payload['route'] : '';
				if ( ! in_array( $method, array( 'GET', 'POST', 'PUT', 'PATCH', 'DELETE' ), true ) || 0 !== strpos( $route, '/bdmpos/v1/' ) || false !== strpos( $route, '..' ) || ! preg_match( '#^/bdmpos/v1/[a-zA-Z0-9_/-]+$#', $route ) ) {
					return new WP_Error( 'bdmpos_invalid_core_request', 'Ongeldig Core-verzoek.' );
				}
				$internal = new WP_REST_Request( $method, $route );
				$internal->set_query_params( isset( $payload['params'] ) && is_array( $payload['params'] ) ? $payload['params'] : array() );
				if ( in_array( $method, array( 'POST', 'PUT', 'PATCH', 'DELETE' ), true ) ) {
					$body = isset( $payload['body'] ) && is_array( $payload['body'] ) ? $payload['body'] : array();
					if ( isset( $payload['body'] ) && is_string( $payload['body'] ) ) {
						$decoded_body = json_decode( $payload['body'], true );
						if ( is_array( $decoded_body ) ) {
							$body = $decoded_body;
						}
					}
					// rest_do_request does not parse a raw body into get_param().
					// Without these, the WooCommerce gateway never sees the order.
					$internal->set_body_params( $body );
					$internal->set_json_params( $body );
					$internal->set_body( wp_json_encode( $body ) );
					$internal->set_header( 'content-type', 'application/json' );
				}
				$internal->set_header( 'x_bdm_pos_secret', BDMPOS_Core_Settings::get( 'core_secret' ) );
				$response = rest_do_request( $internal );
				if ( is_wp_error( $response ) ) {
					return array(
						'http_status' => 500,
						'data'        => array( 'message' => $response->get_error_message() ),
					);
				}
				$status = $response instanceof WP_REST_Response ? (int) $response->get_status() : 200;
				$data   = $response instanceof WP_REST_Response ? $response->get_data() : $response;
				if ( ! is_array( $data ) ) {
					$data = array( 'message' => 'Interne Core-aanvraag gaf HTTP ' . $status . ' terug.' );
				}
				return array( 'http_status' => $status, 'data' => $data );

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

		// The POS lease is two minutes. Keep the WordPress lock longer than a normal
		// run so a slow batch cannot be started twice by overlapping WP-Cron calls.
		set_transient( self::LOCK, 110, 110 );
		$started = microtime( true );
		$stats   = array(
			'pulled'          => 0,
			'completed'       => 0,
			'failed'          => 0,
			'ack_errors'      => 0,
			'last_command_id' => '',
			'details'         => array(),
		);
		$last = array(
			'at'        => gmdate( 'c' ),
			'success'   => false,
			'message'   => 'Worker gestart.',
			'processed' => $stats,
		);

		try {
			$base_url = BDMPOS_Core_Settings::get( 'pos_command_url' );
			$pull_url = add_query_arg( 'action', 'pull', $base_url );
			$pull     = $this->request( 'GET', $pull_url );
			if ( is_wp_error( $pull ) ) {
				throw new Exception( 'POS pull mislukt: ' . $pull->get_error_message() );
			}

			$pull_code = (int) wp_remote_retrieve_response_code( $pull );
			if ( 200 !== $pull_code ) {
				throw new Exception( 'POS pull gaf HTTP ' . $pull_code . ' terug.' );
			}

			$data = json_decode( wp_remote_retrieve_body( $pull ), true );
			if ( ! is_array( $data ) || empty( $data['success'] ) || ! isset( $data['commands'] ) || ! is_array( $data['commands'] ) ) {
				throw new Exception( 'Ongeldig antwoord van de POS-opdrachtenwachtrij.' );
			}

			$stats['pulled'] = count( $data['commands'] );
			foreach ( $data['commands'] as $command ) {
				$command_id = isset( $command['command_id'] ) ? sanitize_text_field( $command['command_id'] ) : '';
				if ( '' === $command_id ) {
					$stats['failed']++;
					continue;
				}
				$stats['last_command_id'] = $command_id;
				$command_action = isset( $command['action'] ) ? sanitize_key( $command['action'] ) : 'unknown';

				try {
					$result = $this->execute( $command );
				} catch ( Throwable $execution_error ) {
					$result = new WP_Error( 'bdmpos_execution_exception', sanitize_text_field( $execution_error->getMessage() ) );
				}

				$command_success = ! is_wp_error( $result );
				if ( ! $command_success ) {
					$stats['details'][] = array(
						'command_id' => $command_id,
						'action'     => $command_action,
						'type'       => 'execution',
						'message'    => sanitize_text_field( $result->get_error_message() ),
					);
				}
				$ack = array(
					'command_id' => $command_id,
					'success'    => $command_success,
					'result'     => $command_success ? $result : null,
					'error'      => $command_success ? '' : $result->get_error_message(),
				);

				$ack_url      = add_query_arg( 'action', 'ack', $base_url );
				$ack_response = $this->request( 'POST', $ack_url, $ack );
				if ( is_wp_error( $ack_response ) ) {
					$stats['ack_errors']++;
					$stats['details'][] = array(
						'command_id' => $command_id,
						'action'     => $command_action,
						'type'       => 'acknowledgement',
						'message'    => sanitize_text_field( $ack_response->get_error_message() ),
					);
					continue;
				}

				$ack_code = (int) wp_remote_retrieve_response_code( $ack_response );
				$ack_data = json_decode( wp_remote_retrieve_body( $ack_response ), true );
				if ( $ack_code < 200 || $ack_code >= 300 || ! is_array( $ack_data ) || empty( $ack_data['success'] ) ) {
					$stats['ack_errors']++;
					$ack_message = is_array( $ack_data ) && ! empty( $ack_data['error'] ) ? sanitize_text_field( $ack_data['error'] ) : 'POS bevestigde de opdracht niet.';
					$stats['details'][] = array(
						'command_id' => $command_id,
						'action'     => $command_action,
						'type'       => 'acknowledgement',
						'message'    => 'HTTP ' . $ack_code . ': ' . $ack_message,
					);
					continue;
				}

				if ( $command_success ) {
					$stats['completed']++;
				} else {
					$stats['failed']++;
				}
			}

			$last = array(
				'at'        => gmdate( 'c' ),
				'success'   => 0 === $stats['ack_errors'],
				'message'   => 0 === $stats['pulled']
					? 'Worker actief; geen opdrachten in de wachtrij.'
					: sprintf(
						'Batch verwerkt: %1$d opgehaald, %2$d voltooid, %3$d mislukt, %4$d bevestigingsfouten.',
						$stats['pulled'],
						$stats['completed'],
						$stats['failed'],
						$stats['ack_errors']
					),
				'processed' => $stats,
				'details'   => array_slice( $stats['details'], 0, 10 ),
				'duration_ms' => (int) round( ( microtime( true ) - $started ) * 1000 ),
			);
		} catch ( Throwable $error ) {
			$last = array(
				'at'          => gmdate( 'c' ),
				'success'     => false,
				'message'     => sanitize_text_field( $error->getMessage() ),
				'processed'   => $stats,
				'details'     => array_slice( $stats['details'], 0, 10 ),
				'duration_ms' => (int) round( ( microtime( true ) - $started ) * 1000 ),
			);
		} finally {
			update_option( 'bdmpos_core_worker_last_run', $last, false );
			delete_transient( self::LOCK );
		}
	}
}
