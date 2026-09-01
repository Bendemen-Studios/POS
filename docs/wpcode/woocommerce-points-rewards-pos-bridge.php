<?php
/**
 * Bendemen POS <-> WooCommerce Points & Rewards bridge.
 * Add in WPCode on bendemen.com and run everywhere.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

/* POS orders are awarded after they become completed. Priority 99 lets the
 * normal Points & Rewards order hook run first; we then top-up only the
 * difference needed to reach the POS earning rule. */
add_action( 'woocommerce_order_status_completed', 'bdm_pos_award_completed_order_points', 99, 1 );
function bdm_pos_award_completed_order_points( $order_id ) {
    if ( ! class_exists( 'WC_Points_Rewards_Manager' ) ) return;
    $order = wc_get_order( $order_id );
    if ( ! $order ) return;
    if ( 'true' !== (string) $order->get_meta( '_pos_direct_checkout', true ) ) return;

    $customer_id = absint( $order->get_customer_id() );
    if ( ! $customer_id ) return;

    $total = (float) $order->get_total();
    if ( $total <= 0 ) return;

    $whole = (int) floor( $total );
    $cents = (int) round( ( $total - $whole ) * 100 );
    $target = $whole + ( $cents >= 51 ? 1 : 0 );
    if ( $target <= 0 ) return;

    $plugin_earned = max( 0, (int) $order->get_meta( '_wc_points_earned', true ) );
    $pos_awarded = max( 0, (int) $order->get_meta( '_bdm_pos_points_awarded', true ) );
    $already_counted = max( $plugin_earned, $pos_awarded );
    $missing = max( 0, $target - $already_counted );

    if ( $missing > 0 ) {
        $result = WC_Points_Rewards_Manager::increase_points(
            $customer_id,
            $missing,
            'bdm-pos-order-earned',
            array( 'source' => 'bendemen-pos', 'order_id' => $order_id, 'target_points' => $target, 'missing_points' => $missing ),
            $order_id
        );
        if ( ! $result ) return;
        $pos_awarded += $missing;
    }

    $order->update_meta_data( '_wc_points_earned', $target );
    $order->update_meta_data( '_bdm_pos_points_awarded', $pos_awarded );
    $order->update_meta_data( '_bdm_pos_points_source', 'bendemen-pos' );
    $order->save();
}

add_action( 'rest_api_init', function () {
    register_rest_route( 'wc/v3', '/bdm-points', array(
        array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'bdm_pos_points_balance',
            'permission_callback' => 'bdm_pos_points_permission',
            'args' => array(
                'customer_id' => array('required' => false, 'type' => 'integer', 'sanitize_callback' => 'absint'),
                'customer_ids' => array('required' => false, 'type' => 'string', 'sanitize_callback' => 'sanitize_text_field'),
            ),
        ),
        array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => 'bdm_pos_points_mutation',
            'permission_callback' => 'bdm_pos_points_permission',
            'args' => array(
                'action' => array('required' => true, 'type' => 'string'),
                'customer_id' => array('required' => true, 'type' => 'integer', 'sanitize_callback' => 'absint'),
                'points' => array('required' => true, 'type' => 'integer', 'sanitize_callback' => 'absint'),
                'order_id' => array('required' => true, 'type' => 'integer', 'sanitize_callback' => 'absint'),
            ),
        ),
    ) );
} );

function bdm_pos_points_permission( WP_REST_Request $request ) {
    if ( ! class_exists( 'WC_Points_Rewards_Manager' ) ) return new WP_Error('bdm_points_rewards_missing', 'WooCommerce Points & Rewards is not active.', array('status' => 503));
    $customer_id = absint( $request->get_param( 'customer_id' ) );
    $customer_ids_raw = $request->get_param( 'customer_ids' );
    $first_customer_id = $customer_id;
    if ( ! $first_customer_id && is_string( $customer_ids_raw ) ) $first_customer_id = absint( trim( explode(',', $customer_ids_raw)[0] ?? '' ) );
    $context = $request->get_method() === 'GET' ? 'read' : 'edit';
    if ( function_exists( 'wc_rest_check_user_permissions' ) && $first_customer_id > 0 && wc_rest_check_user_permissions( $context, $first_customer_id ) ) return true;
    if ( current_user_can( 'manage_woocommerce' ) || current_user_can( 'edit_users' ) ) return true;
    return new WP_Error('bdm_points_forbidden', 'Insufficient WooCommerce permissions for the authenticated REST API user.', array('status' => 403));
}

function bdm_pos_points_balance( WP_REST_Request $request ) {
    $customer_ids_raw = $request->get_param('customer_ids');
    $customer_id = absint($request->get_param('customer_id'));
    $customer_ids = array();
    if ( is_string($customer_ids_raw) && '' !== trim($customer_ids_raw) ) {
        foreach ( explode(',', $customer_ids_raw) as $id ) { $id = absint(trim($id)); if ($id > 0) $customer_ids[] = $id; }
        $customer_ids = array_values(array_unique($customer_ids));
    }
    if ($customer_id > 0 && empty($customer_ids)) $customer_ids = array($customer_id);
    if (empty($customer_ids)) return new WP_Error('bdm_invalid_customer', 'A customer ID is required.', array('status' => 400));
    $balances = array();
    foreach ($customer_ids as $id) $balances[(string)$id] = get_userdata($id) ? max(0, (int) WC_Points_Rewards_Manager::get_users_points($id)) : 0;
    if (count($balances) === 1) {
        $single_id = (int) array_key_first($balances);
        return rest_ensure_response(array('success' => true, 'customerId' => $single_id, 'pointsBalance' => $balances[(string)$single_id], 'source' => 'woocommerce-points-and-rewards'));
    }
    return rest_ensure_response(array('success' => true, 'balances' => $balances, 'count' => count($balances), 'source' => 'woocommerce-points-and-rewards'));
}

function bdm_pos_points_mutation( WP_REST_Request $request ) {
    $action = sanitize_key($request->get_param('action'));
    $customer_id = absint($request->get_param('customer_id'));
    $points = absint($request->get_param('points'));
    $order_id = absint($request->get_param('order_id'));
    if (!$customer_id || !$points || !$order_id) return new WP_Error('bdm_invalid_points_request', 'Customer, points and order ID are required.', array('status' => 400));
    $order = wc_get_order($order_id);
    if (!$order) return new WP_Error('bdm_order_not_found', 'WooCommerce order not found.', array('status' => 404));
    if ((int)$order->get_customer_id() !== $customer_id) return new WP_Error('bdm_customer_mismatch', 'Order customer does not match the points customer.', array('status' => 400));

    if ('sync_earned' === $action) {
        $target = $points;
        $plugin_earned = max(0, (int)$order->get_meta('_wc_points_earned', true));
        $pos_awarded = max(0, (int)$order->get_meta('_bdm_pos_points_awarded', true));
        $missing = max(0, $target - max($plugin_earned, $pos_awarded));
        if ($missing > 0) {
            $result = WC_Points_Rewards_Manager::increase_points($customer_id, $missing, 'bdm-pos-order-earned', array('source' => 'bendemen-pos', 'order_id' => $order_id, 'target_points' => $target, 'missing_points' => $missing), $order_id);
            if (!$result) return new WP_Error('bdm_points_earn_failed', 'WooCommerce Points & Rewards rejected the points increase.', array('status' => 500));
            $pos_awarded += $missing;
        }
        $order->update_meta_data('_wc_points_earned', $target);
        $order->update_meta_data('_bdm_pos_points_awarded', $pos_awarded);
        $order->update_meta_data('_bdm_pos_points_source', 'bendemen-pos');
        $order->save();
        return rest_ensure_response(array('success' => true, 'pointsTarget' => $target, 'pointsAdded' => $missing, 'pointsPluginAlreadyEarned' => $plugin_earned, 'pointsBalance' => max(0, (int)WC_Points_Rewards_Manager::get_users_points($customer_id))));
    }

    if ('redeem' !== $action) return new WP_Error('bdm_invalid_action', 'Unsupported points action.', array('status' => 400));
    $already_redeemed = (int)$order->get_meta('_bdm_points_redeemed', true);
    if ($already_redeemed > 0) return rest_ensure_response(array('success' => true, 'idempotent' => true, 'pointsRedeemed' => $already_redeemed, 'pointsBalance' => (int)WC_Points_Rewards_Manager::get_users_points($customer_id)));
    if (!add_post_meta($order_id, '_bdm_points_redeem_lock', gmdate('c'), true)) return new WP_Error('bdm_points_processing', 'Points redemption for this order is already being processed.', array('status' => 409));
    try {
        $current_points = (int)WC_Points_Rewards_Manager::get_users_points($customer_id);
        if ($points > $current_points) throw new Exception(sprintf('Insufficient points. Customer has %d points, requested %d.', $current_points, $points));
        $result = WC_Points_Rewards_Manager::decrease_points($customer_id, $points, 'bdm-pos-redeem', array('source' => 'bendemen-pos', 'order_id' => $order_id, 'points_redeemed' => $points), $order_id);
        if (!$result) throw new Exception('WooCommerce Points & Rewards rejected the points deduction.');
        $order->update_meta_data('_wc_points_redeemed', $points);
        $order->update_meta_data('_bdm_points_redeemed', $points);
        $order->update_meta_data('_bdm_points_source', 'woocommerce-points-and-rewards');
        $order->save();
        return rest_ensure_response(array('success' => true, 'pointsRedeemed' => $points, 'pointsBalance' => max(0, (int)WC_Points_Rewards_Manager::get_users_points($customer_id))));
    } catch (Throwable $e) {
        delete_post_meta($order_id, '_bdm_points_redeem_lock');
        return new WP_Error('bdm_points_redeem_failed', $e->getMessage(), array('status' => 500));
    }
}
