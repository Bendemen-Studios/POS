<?php
/**
 * Admin settings for BDM POS Core.
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class BDMPOS_Core_Settings {
	const OPTION = 'bdmpos_core_settings';

	public static function instance() {
		static $instance = null;
		if ( null === $instance ) {
			$instance = new self();
		}
		return $instance;
	}

	private function __construct() {
		add_action( 'admin_menu', array( $this, 'admin_menu' ), 99 );
		add_action( 'admin_post_bdmpos_core_save_settings', array( $this, 'save' ) );
		add_action( 'admin_post_bdmpos_core_test_connection', array( $this, 'test_connection' ) );
	}

	public static function get( $key ) {
		$settings = get_option( self::OPTION, array() );
		if ( is_array( $settings ) && isset( $settings[ $key ] ) && '' !== $settings[ $key ] ) {
			return (string) $settings[ $key ];
		}
		$constants = array(
			'core_secret' => 'BDMPOS_CORE_SECRET',
		);
		$constant = isset( $constants[ $key ] ) ? $constants[ $key ] : '';
		return $constant && defined( $constant ) ? (string) constant( $constant ) : '';
	}

	public static function has( $key ) {
		return '' !== self::get( $key );
	}

	public function admin_menu() {
		add_submenu_page(
			'woocommerce',
			__( 'BDM POS Core', 'bdmpos-core' ),
			__( 'BDM POS Core', 'bdmpos-core' ),
			'manage_options',
			'bdmpos-core',
			array( $this, 'render_page' )
		);
	}

	public function save() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Je hebt geen toestemming om deze instellingen te wijzigen.', 'bdmpos-core' ) );
		}
		check_admin_referer( 'bdmpos_core_save_settings' );
		$settings = get_option( self::OPTION, array() );
		if ( ! is_array( $settings ) ) {
			$settings = array();
		}
		$core_secret = isset( $_POST['core_secret'] ) ? trim( sanitize_text_field( wp_unslash( $_POST['core_secret'] ) ) ) : '';
		$pos_command_url = isset( $_POST['pos_command_url'] ) ? esc_url_raw( trim( wp_unslash( $_POST['pos_command_url'] ) ) ) : '';
		if ( '' !== $pos_command_url && 0 !== strpos( $pos_command_url, 'https://' ) ) {
			$this->redirect( 'invalid_pos_url' );
		}
		if ( '' !== $core_secret ) {
			$settings['core_secret'] = $core_secret;
		}
		unset( $settings['webhook_url'], $settings['webhook_secret'] );
		if ( '' !== $pos_command_url ) {
			$settings['pos_command_url'] = $pos_command_url;
		}
		update_option( self::OPTION, $settings, false );
		$this->redirect( 'saved' );
	}

	public function test_connection() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Je hebt geen toestemming om deze verbinding te testen.', 'bdmpos-core' ) );
		}
		check_admin_referer( 'bdmpos_core_test_connection' );
		$secret = self::get( 'core_secret' );
		if ( '' === $secret ) {
			$this->redirect( 'missing_secret' );
		}
		$response = wp_remote_get(
			rest_url( 'bdmpos/v1/health' ),
			array(
				'timeout' => 15,
				'headers' => array( 'X-BDM-POS-Secret' => $secret ),
			)
		);
		if ( is_wp_error( $response ) ) {
			$this->redirect( 'connection_failed' );
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		$this->redirect( 200 === $code ? 'connection_ok' : 'connection_failed' );
	}

	private function redirect( $status ) {
		wp_safe_redirect( add_query_arg( array( 'page' => 'bdmpos-core', 'bdmpos_notice' => $status ), admin_url( 'admin.php' ) ) );
		exit;
	}

	public function render_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$pos_command_url = self::get( 'pos_command_url' );
		$worker_last_run = get_option( 'bdmpos_core_worker_last_run', array() );
		$notice = isset( $_GET['bdmpos_notice'] ) ? sanitize_key( wp_unslash( $_GET['bdmpos_notice'] ) ) : '';
		$messages = array(
			'saved' => array( 'success', 'Instellingen opgeslagen.' ),
			'connection_ok' => array( 'success', 'Verbinding met BDM POS Core werkt.' ),
			'connection_failed' => array( 'error', 'Verbinding mislukt. Controleer de Core-secret en probeer opnieuw.' ),
			'missing_secret' => array( 'warning', 'Vul eerst de Core API-secret in en sla de instellingen op.' ),
			'invalid_pos_url' => array( 'error', 'De POS-opdrachten-URL moet een geldige HTTPS-URL zijn.' ),
		);
		echo '<div class="wrap"><h1>BDM POS Core</h1>';
		echo '<p>Beheer hier de beveiligde verbinding tussen WooCommerce en Bendemen POS.</p>';
		if ( isset( $messages[ $notice ] ) ) {
			echo '<div class="notice notice-' . esc_attr( $messages[ $notice ][0] ) . ' is-dismissible"><p>' . esc_html( $messages[ $notice ][1] ) . '</p></div>';
		}
		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		echo '<input type="hidden" name="action" value="bdmpos_core_save_settings">';
		wp_nonce_field( 'bdmpos_core_save_settings' );
		echo '<h2>API-verbinding</h2><table class="form-table" role="presentation"><tbody>';
		echo '<tr><th scope="row"><label for="bdmpos-core-secret">Core API-secret</label></th><td><input id="bdmpos-core-secret" name="core_secret" type="password" class="regular-text" autocomplete="new-password" placeholder="' . esc_attr( self::has( 'core_secret' ) ? 'Secret opgeslagen — leeg laten om te behouden' : 'Plak hier de Core API-secret' ) . '"><p class="description">Gebruik exact dezelfde waarde als BDMPOS_CORE_SECRET in de POS-serveromgeving. De opgeslagen secret wordt niet opnieuw getoond.</p></td></tr>';
		echo '</tbody></table><h2>POS-opdrachtenwachtrij</h2><table class="form-table" role="presentation"><tbody>';
		echo '<tr><th scope="row"><label for="bdmpos-pos-command-url">POS opdrachten-URL</label></th><td><input id="bdmpos-pos-command-url" name="pos_command_url" type="url" class="regular-text" value="' . esc_attr( $pos_command_url ) . '" placeholder="https://jouw-pos-domein/api/core/commands"><p class="description">WordPress haalt opdrachten op bij de POS. De Core API-secret hierboven wordt hiervoor gebruikt. Order-aanmaak blijft uitgeschakeld.</p></td></tr>';
		echo '</tbody></table>';
		submit_button( 'Instellingen opslaan' );
		echo '</form>';
		echo '<hr><h2>Verbindingscontrole</h2><p>Test of WordPress de Core API met de ingestelde secret kan bereiken.</p><form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '"><input type="hidden" name="action" value="bdmpos_core_test_connection">';
		wp_nonce_field( 'bdmpos_core_test_connection' );
		submit_button( 'Test verbinding', 'secondary', 'submit', false );
		echo '</form>';
		echo '<hr><h2>Synchronisatiestatus</h2><table class="widefat striped" style="max-width:760px"><tbody>';
		echo '<tr><td><strong>Opdrachtenworker</strong></td><td>' . ( self::has( 'pos_command_url' ) && self::has( 'core_secret' ) ? '<span style="color:green">Geconfigureerd</span>' : '<span style="color:#b32d2e">Nog niet geconfigureerd</span>' ) . '</td></tr>';
		echo '<tr><td><strong>Laatste worker-run</strong></td><td>' . esc_html( isset( $worker_last_run['at'] ) ? $worker_last_run['at'] . ' — ' . ( ! empty( $worker_last_run['success'] ) ? 'Geslaagd' : 'Mislukt: ' . ( $worker_last_run['message'] ?? '' ) ) : 'Nog niet uitgevoerd' ) . '</td></tr>';
		if ( ! empty( $worker_last_run['details'] ) && is_array( $worker_last_run['details'] ) ) {
			echo '<tr><td><strong>Opdrachtfouten</strong></td><td><ul style="margin:0">';
			foreach ( array_slice( $worker_last_run['details'], 0, 10 ) as $detail ) {
				$label = isset( $detail['action'] ) ? $detail['action'] : 'onbekend';
				$type  = isset( $detail['type'] ) ? $detail['type'] : 'fout';
				$msg   = isset( $detail['message'] ) ? $detail['message'] : 'Geen foutdetails beschikbaar.';
				echo '<li><code>' . esc_html( $label ) . '</code> (' . esc_html( $type ) . '): ' . esc_html( $msg ) . '</li>';
			}
			echo '</ul></td></tr>';
		}
		echo '</tbody></table></div>';
	}
}
