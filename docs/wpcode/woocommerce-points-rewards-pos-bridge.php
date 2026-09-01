<?php
/**
 * Bendemen POS <-> WooCommerce Points & Rewards bridge.
 *
 * Add this as a PHP snippet in WPCode on bendemen.com and set it to run
 * everywhere. The POS authenticates this endpoint with its existing
 * WooCommerce REST API key, so no second secret is required.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'rest_api_init', function () {
    register_rest_route(
        'wc/v3',
        '/bdm-points',
        array(
            array(
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => 'bdm_pos_points_balance',
                'permission_callback' => 'bdm_pos_points_permission',
                'args'                => array(
                    'customer_id' => array(
                        'required'          => true,
                        'type'              => 'integer',
                        'sanitize_callback' => 'absint',
                    ),
                ),
            ),
            array(
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => 'bdm_pos_points_mutation',
                'permission_callback' => 'bdm_pos_points_permission',
                'args'                => array(
                    'action' => array(
                        'required' => true,
                        'type'     => 'string',
                    ),
                    'customer_id' => array(
                        'required'          => true,
                        'type'              => 'integer',
                        'sanitize_callback' => 'absint',
                    ),
                    'points' => array(
                        'required'          => true,
                        'type'              => 'integer',
                        'sanitize_callback' => 'absint',
                    ),
                    'order_id' => array(
                        'required'          => true,
                        'type'              => 'integer',
                        'sanitize_callback' => 'absint',
                    ),
                ),
            ),
        )
    );
} );

function bdm_pos_points_permission() {
    if ( ! class_exists( 'WC_Points_Rewards_Manager' ) ) {
        return new WP_Error(
            'bdm_points_rewards_missing',
            'WooCommerce Points & Rewards is not active.',
            array( 'status' => 503 )
        );
    }

    if ( ! current_user_can( 'manage_woocommerce' ) ) {
        return new WP_Error(
            'bdm_points_forbidden',
            'Insufficient WooCommerce permissions.',
            array( 'status' => 403 )
        );
    }

    return true;
}

function bdm_pos_points_balance( WP_REST_Request $request ) {
    $customer_id = absint( $request->get_param( 'customer_id' ) );

    if ( ! $customer_id ) {
        return new WP_Error( 'bdm_invalid_customer', 'Invalid customer ID.', array( 'status' => 400 ) );
    }

    $points = (int) WC_Points_Rewards_Manager::get_users_points( $customer_id );

    return rest_ensure_response(
        array(
            'success'      => true,
            'customerId'   => $customer_id,
            'pointsBalance' => max( 0, $points ),
        )
    );
}

function bdm_pos_points_mutation( WP_REST_Request $request ) {
    $action      = sanitize_key( $request->get_param( 'action' ) );
    $customer_id = absint( $request->get_param( 'customer_id' ) );
    $points      = absint( $request->get_param( 'points' ) );
    $order_id    = absint( $request->get_param( 'order_id' ) );

    if ( 'redeem' !== $action ) {
        return new WP_Error( 'bdm_invalid_action', 'Unsupported points action.', array( 'status' => 400 ) );
    }

    if ( ! $customer_id || ! $points || ! $order_id ) {
        return new WP_Error( 'bdm_invalid_points_request', 'Customer, points and order ID are required.', array( 'status' => 400 ) );
    }

    $order = wc_get_order( $order_id );
    if ( ! $order ) {
        return new WP_Error( 'bdm_order_not_found', 'WooCommerce order not found.', array( 'status' => 404 ) );
    }

    if ( (int) $order->get_customer_id() !== $customer_id ) {
        return new WP_Error( 'bdm_customer_mismatch', 'Order customer does not match the points customer.', array( 'status' => 400 ) );
    }

    // Idempotency: a POS retry for the same WooCommerce order must never
    // deduct the same points twice.
    $already_redeemed = (int) $order->get_meta( '_bdm_points_redeemed', true );
    if ( $already_redeemed > 0 ) {
        return rest_ensure_response(
            array(
                'success'       => true,
                'idempotent'    => true,
                'pointsRedeemed' => $already_redeemed,
                'pointsBalance' => (int) WC_Points_Rewards_Manager::get_users_points( $customer_id ),
            )
        );
    }

    // A unique post meta acts as a small per-order lock. If another request
    // is already processing this exact order, do not deduct twice.
    if ( ! add_post_meta( $order_id, '_bdm_points_redeem_lock', gmdate( 'c' ), true ) ) {
        return new WP_Error( 'bdm_points_processing', 'Points redemption for this order is already being processed.', array( 'status' => 409 ) );
    }

    try {
        $current_points = (int) WC_Points_Rewards_Manager::get_users_points( $customer_id );

        if ( $points > $current_points ) {
            throw new Exception(
                sprintf(
                    'Insufficient points. Customer has %d points, requested %d.',
                    $current_points,
                    $points
                )
            );
        }

        $event_data = array(
            'source'        => 'bendemen-pos',
            'order_id'      => $order_id,
            'points_redeemed' => $points,
        );

        $result = WC_Points_Rewards_Manager::decrease_points(
            $customer_id,
            $points,
            'bdm-pos-redeem',
            $event_data,
            $order_id
        );

        if ( ! $result ) {
            throw new Exception( 'WooCommerce Points & Rewards rejected the points deduction.' );
        }

        // Keep the standard Points & Rewards order meta in sync as well,
        // because the POS creates orders directly instead of using checkout.
        $order->update_meta_data( '_wc_points_redeemed', $points );
        $order->update_meta_data( '_bdm_points_redeemed', $points );
        $order->update_meta_data( '_bdm_points_source', 'woocommerce-points-and-rewards' );
        $order->save();

        $new_balance = (int) WC_Points_Rewards_Manager::get_users_points( $customer_id );

        return rest_ensure_response(
            array(
                'success'        => true,
                'pointsRedeemed' => $points,
                'pointsBalance'  => max( 0, $new_balance ),
            )
        );
    } catch ( Throwable $e ) {
        delete_post_meta( $order_id, '_bdm_points_redeem_lock' );

        return new WP_Error(
            'bdm_points_redeem_failed',
            $e->getMessage(),
            array( 'status' => 500 )
        );
    }
}
