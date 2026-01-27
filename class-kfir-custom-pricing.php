<?php
/**
 * Plugin Name: KFIR Custom Pricing
 * Description: ניהול מחירים מותאמים ללקוח כולל מוצרים ללא מחיר בסיסי.
 * Version: 1.0
 * Author: Omer Elias
 */

if ( ! defined( 'ABSPATH' ) ) exit;

class KFIR_Custom_Pricing {

	public function __construct() {
		add_filter( 'woocommerce_get_price_html', [ $this, 'custom_price_html' ], 50, 2 );
		add_filter( 'woocommerce_is_purchasable', [ $this, 'allow_zero_price_products' ], 20, 2 );
		add_filter( 'woocommerce_variation_is_purchasable', [ $this, 'allow_zero_price_variations' ], 20, 2 );
		add_action( 'woocommerce_before_calculate_totals', [ $this, 'apply_custom_price_to_cart' ], 20 );
		add_filter( 'woocommerce_cart_item_price', [ $this, 'custom_cart_item_price_display' ], 20, 3 );
        add_filter( 'woocommerce_cart_item_subtotal', [ $this, 'custom_cart_item_price_display' ], 20, 3 ); 

        add_filter( 'woocommerce_cart_totals_order_total_html', [ $this, 'maybe_hide_order_total' ] );
		add_filter( 'woocommerce_order_amount_total', [ $this, 'maybe_force_order_total_zero' ], 10, 2 );
		add_action( 'woocommerce_update_order', [ $this, 'oc_update_custom_prices_on_order_save' ], 20, 3 );
        add_action( 'woocommerce_checkout_order_processed', [ $this, 'oc_set_order_on_hold_for_specific_shipping' ], 10, 3 );

		// Hide add to cart button for non-logged-in users
		// Using init hook with high priority to ensure it runs before template is rendered
		add_action( 'init', [ $this, 'oc_remove_add_to_cart_for_guests' ], 999 );

		// AJAX endpoint to get custom price for variation
		add_action( 'wp_ajax_get_custom_variation_price', [ $this, 'ajax_get_custom_variation_price' ] );
		add_action( 'wp_ajax_nopriv_get_custom_variation_price', [ $this, 'ajax_get_custom_variation_price' ] );
	}

	/**
	 * Remove add to cart button for non-logged-in users
	 */
	public function oc_remove_add_to_cart_for_guests() {
		// אם המשתמש לא מחובר
		if ( ! is_user_logged_in() ) {
			// הסרה בעמוד מוצר - צריך priority זהה לזה שהוגדר ב-WooCommerce
			remove_action( 'woocommerce_single_product_summary', 'woocommerce_template_single_add_to_cart', 30 );

			// הסרה בעמוד קטגוריה / חנות
			remove_action( 'woocommerce_after_shop_loop_item', 'woocommerce_template_loop_add_to_cart', 10 );
		}
	}

	public function allow_zero_price_products( $purchasable, $product ) {
		if ( ! is_user_logged_in() ) return false;
		if ( $product->get_price() !== '' && $product->get_price() > 0 ) return true;
		$price = $this->get_customer_price( get_current_user_id(), $product->get_id() );
		if ( $price !== null && $price > 0 ) return true;
		return true;
	}

	/**
	 * Allow variations with zero or empty price to be purchasable if user is logged in
	 */
	public function allow_zero_price_variations( $purchasable, $variation ) {
		if ( ! is_user_logged_in() ) return false;
		
		// If variation already has a price, allow it
		if ( $variation->get_price() !== '' && $variation->get_price() > 0 ) {
			return $purchasable;
		}
		
		// Check if there's a custom price for this variation
		$price = $this->get_customer_price( get_current_user_id(), $variation->get_id() );
		if ( $price !== null && $price > 0 ) {
			return true;
		}
		
		// Allow variation to be purchasable even without price (for logged in users)
		return true;
	}

    public function custom_price_html( $price_html, $product ) {
        if ( ! is_user_logged_in() )
        {
            if(!is_product()){
                return '<a class="no-price login-panel">התחבר כדי להזמין</a>';

            }
            else{
                return '<button class="no-price no-price-logged-out login-panel">
<a class="login-panel" style="color:white;">התחבר כדי להזמין</a></button>';

            }
        }
        
        $price = $this->get_customer_price( get_current_user_id(), $product->get_id() );
        if ( $price !== null && $price > 0 ) return wc_price( $price );
        
        // Check if product has zero or empty price
        $product_price = $product->get_price();
        if ( $product_price === '' || $product_price == 0 ) {
            // Show "מחיר ייקבע בהמשך" for zero/empty prices
            return '<span class="no-price">מחיר ייקבע בהמשך</span>';
        }
        
        // Return default price HTML if price exists
        return $price_html;
    }

    public function apply_custom_price_to_cart( $cart ) {
		if ( is_admin() && ! defined( 'DOING_AJAX' ) ) return;
		if ( ! is_user_logged_in() ) return;
		$user_id = get_current_user_id();
		foreach ( $cart->get_cart() as $cart_item ) {
			$product = $cart_item['data'];
			$product_id = $product->get_id();
			$custom_price = $this->get_customer_price( $user_id, $product_id );
			if ( $custom_price !== null && $custom_price > 0 ) {
				$product->set_price( $custom_price );
			}
		}
	}

	public function custom_cart_item_price_display( $price, $cart_item, $cart_item_key ) {
		if ( ! is_user_logged_in() ) return $price;
		$product = $cart_item['data'];
		$product_id = $product->get_id();
		$custom_price = $this->get_customer_price( get_current_user_id(), $product_id );
		if ( $custom_price === null && ( $product->get_price() === '' || $product->get_price() == 0 ) ) {
			return '<span class="no-price">מחיר לא סופי</span>';
		}
		return $price;
	}

	public function maybe_hide_order_total( $html ) {
		if ( $this->cart_has_missing_prices() ) {
			return '<strong>סה״כ: מחיר לא סופי</strong><br><small>המחיר יעודכן לאחר תמחור לפי הלקוח</small>';
		}
		return $html;
	}

	public function maybe_force_order_total_zero( $total, $order ) {
		if ( is_admin() || is_checkout() ) {
			if ( $this->order_has_missing_prices( $order ) ) {
				return 0;
			}
		}
		return $total;
	}

	protected function cart_has_missing_prices() {
		if ( ! WC()->cart ) return false;
		foreach ( WC()->cart->get_cart() as $item ) {
			$product = $item['data'];
			$price = $this->get_customer_price( get_current_user_id(), $product->get_id() );
			if ( $price === null && ( $product->get_price() === '' || $product->get_price() == 0 ) ) {
				return true;
			}
		}
		return false;
	}

	protected function order_has_missing_prices( $order ) {
		foreach ( $order->get_items() as $item ) {
			$price = $item->get_total();
			if ( $price <= 0 ) return true;
		}
		return false;
	}

	public function get_customer_price( $user_id, $product_id ) {
		$meta_key = 'custom_price_' . $product_id;
		$value = get_user_meta( $user_id, $meta_key, true );
		return $value !== '' ? floatval( $value ) : null;
	}

	public function set_customer_price( $user_id, $product_id, $price ) {
		update_user_meta( $user_id, 'custom_price_' . $product_id, $price );
	}

	function oc_update_custom_prices_on_order_save( $order_id ) {
        $order = wc_get_order( $order_id );
        if ( ! $order ) return;
    
        $user_id = $order->get_user_id();
        if ( ! $user_id ) return;
    
        foreach ( $order->get_items() as $item ) {
            $product = $item->get_product();
            if ( ! $product ) continue;
    
            $product_id = $product->get_id();
            $qty = $item->get_quantity();
            $total = $item->get_total();
    
            if ( $qty <= 0 || $total <= 0 ) continue;
    
            $new_price = round( $total / $qty, wc_get_price_decimals() );
            $meta_key  = 'custom_price_' . $product_id;
            $current   = get_user_meta( $user_id, $meta_key, true );
    
            if ( $current === '' || floatval( $current ) !== floatval( $new_price ) ) {
                update_user_meta( $user_id, $meta_key, $new_price );
            }
        }  
    }
 
    public function oc_set_order_on_hold_for_specific_shipping( $order_id, $posted_data, $order ) {
        if ( ! $order ) return;
        $order->update_status( 'on-hold', 'שיטת משלוח מחייבת סטטוס בהשהייה' );
        
    }

	/**
	 * AJAX endpoint to get custom price for a variation
	 */
	public function ajax_get_custom_variation_price() {
		if ( ! is_user_logged_in() ) {
			wp_send_json_error( [ 'message' => 'Not logged in' ] );
		}

		$variation_id = isset( $_POST['variation_id'] ) ? absint( $_POST['variation_id'] ) : 0;
		if ( ! $variation_id ) {
			wp_send_json_error( [ 'message' => 'Invalid variation ID' ] );
		}

		$user_id = get_current_user_id();
		$custom_price = $this->get_customer_price( $user_id, $variation_id );

		if ( $custom_price !== null && $custom_price > 0 ) {
			wp_send_json_success( [
				'price' => $custom_price,
				'formatted_price' => wc_price( $custom_price ),
				'has_custom_price' => true
			] );
		} else {
			wp_send_json_success( [
				'price' => null,
				'formatted_price' => null,
				'has_custom_price' => false
			] );
		}
	}
}

new KFIR_Custom_Pricing();
