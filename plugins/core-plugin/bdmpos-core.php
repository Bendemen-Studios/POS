<?php
/**
 * Plugin Name: BDM POS Core
 * Description: Secure, versioned integration layer between Bendemen POS and WooCommerce.
 * Version: 0.12.1
 * Author: Bendemen
 * Requires Plugins: woocommerce
 * Text Domain: bdmpos-core
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'BDMPOS_CORE_VERSION', '0.12.1' );
define( 'BDMPOS_CORE_FILE', __FILE__ );
define( 'BDMPOS_CORE_PATH', plugin_dir_path( __FILE__ ) );

require_once BDMPOS_CORE_PATH . 'includes/class-bdmpos-core-settings.php';
require_once BDMPOS_CORE_PATH . 'includes/class-bdmpos-core-rest.php';
require_once BDMPOS_CORE_PATH . 'includes/class-bdmpos-core-worker.php';

add_action(
	'plugins_loaded',
	static function () {
		if ( ! class_exists( 'WooCommerce' ) ) {
			add_action(
				'admin_notices',
				static function () {
					if ( current_user_can( 'activate_plugins' ) ) {
						echo '<div class="notice notice-error"><p>' .
							esc_html__( 'BDM POS Core vereist een actieve WooCommerce-installatie.', 'bdmpos-core' ) .
							'</p></div>';
					}
				}
			);
			return;
		}

		BDMPOS_Core_Settings::instance();
		BDMPOS_Core_REST::instance();
		BDMPOS_Core_Worker::instance();
	}
);
