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
			'webhook_url' => 'BDMPOS_CORE_WEBHOOK_URL',
			'webhook_secret' => 'BDMPOS_CORE_WEBHOOK_SECRET',
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
		$webhook_secret = isset( $_POST['webhook_secret'] ) ? trim( sanitize_text_field( wp_unslash( $_POST['webhook_secret'] ) ) ) : '';
		$webhook_url = isset( $_POST['webhook_url'] ) ? esc_url_raw( trim( wp_unslash( $_POST['webhook_url'] ) ) ) : '';
		if ( '' !== $webhook_url && 0 !== strpos( $webhook_url, 'https://' ) ) {
			$this->redirect( 'invalid_url' );
		}
		if ( '' !== $core_secret ) {
			$settings['core_secret'] = $core_secret;
		}
		if ( '' !== $webhook_secret ) {
			if ( strlen( $webhook_secret ) < 32 ) {
				$this->redirect( 'short_webhook_secret' );
			}
			$settings['webhook_secret'] = $webhook_secret;
		}
		if ( '' !== $webhook_url ) {
			$settings['webhook_url'] = $webhook_url;
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
		$webhook_url = self::get( 'webhook_url' );
		$sync_attempt = get_option( 'bdmpos_core_sync_last_attempt', array() );
		$last_success = get_option( 'bdmpos_core_sync_last_success', '' );
		$notice = isset( $_GET['bdmpos_notice'] ) ? sanitize_key( wp_unslash( $_GET['bdmpos_notice'] ) ) : '';
		$messages = array(
			'saved' => array( 'success', 'Instellingen opgeslagen.' ),
			'connection_ok' => array( 'success', 'Verbinding met BDM POS Core werkt.' ),
			'connection_failed' => array( 'error', 'Verbinding mislukt. Controleer de Core-secret en probeer opnieuw.' ),
			'missing_secret' => array( 'warning', 'Vul eerst de Core API-secret in en sla de instellingen op.' ),
			'invalid_url' => array( 'error', 'De webhook-URL moet een geldige HTTPS-URL zijn.' ),
			'short_webhook_secret' => array( 'error', 'De webhook-secret moet minimaal 32 tekens bevatten.' ),
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
		echo '</tbody></table><h2>Webhook-synchronisatie</h2><table class="form-table" role="presentation"><tbody>';
		echo '<tr><th scope="row"><label for="bdmpos-webhook-url">Webhook-URL</label></th><td><input id="bdmpos-webhook-url" name="webhook_url" type="url" class="regular-text" value="' . esc_attr( $webhook_url ) . '" placeholder="https://jouw-pos-domein/api/webhooks/bdmpos-core"><p class="description">HTTPS-adres van de POS-webhookontvanger.</p></td></tr>';
		echo '<tr><th scope="row"><label for="bdmpos-webhook-secret">Webhook-secret</label></th><td><input id="bdmpos-webhook-secret" name="webhook_secret" type="password" class="regular-text" autocomplete="new-password" placeholder="' . esc_attr( self::has( 'webhook_secret' ) ? 'Secret opgeslagen — leeg laten om te behouden' : 'Minimaal 32 tekens' ) . '"><p class="description">Moet overeenkomen met BDMPOS_CORE_WEBHOOK_SECRET in de POS-serveromgeving.</p></td></tr>';
		echo '</tbody></table>';
		submit_button( 'Instellingen opslaan' );
		echo '</form>';
		echo '<hr><h2>Verbindingscontrole</h2><p>Test of WordPress de Core API met de ingestelde secret kan bereiken.</p><form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '"><input type="hidden" name="action" value="bdmpos_core_test_connection">';
		wp_nonce_field( 'bdmpos_core_test_connection' );
		submit_button( 'Test verbinding', 'secondary', 'submit', false );
		echo '</form>';
		echo '<hr><h2>Synchronisatiestatus</h2><table class="widefat striped" style="max-width:760px"><tbody>';
		echo '<tr><td><strong>Webhook geconfigureerd</strong></td><td>' . ( self::has( 'webhook_url' ) && self::has( 'webhook_secret' ) ? '<span style="color:green">Ja</span>' : '<span style="color:#b32d2e">Nee</span>' ) . '</td></tr>';
		echo '<tr><td><strong>Laatste succesvolle synchronisatie</strong></td><td>' . esc_html( $last_success ? $last_success : 'Nog geen succesvolle synchronisatie' ) . '</td></tr>';
		echo '<tr><td><strong>Laatste poging</strong></td><td>' . esc_html( isset( $sync_attempt['at'] ) ? $sync_attempt['at'] : 'Nog geen poging geregistreerd' ) . '</td></tr>';
		echo '<tr><td><strong>Resultaat laatste poging</strong></td><td>' . esc_html( isset( $sync_attempt['success'] ) ? ( $sync_attempt['success'] ? 'Geslaagd' : 'Mislukt' ) : 'Nog niet getest' ) . '</td></tr>';
		echo '</tbody></table></div>';
	}
}
