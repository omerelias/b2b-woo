<?php
/**
 * ממשק סוכנים: יצירת לקוחות חדשים וביצוע הזמנות עבורם
 * 
 * @package KFIR_Custom_Pricing
 * @version 1.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

class KFIR_Custom_Pricing_Agent {

	public function __construct() {
		add_action( 'init', [ $this, 'register_agent_role' ] );
		add_shortcode( 'kfir_agent_interface', [ $this, 'render_interface' ] );
		add_action( 'wp_enqueue_scripts', [ $this, 'enqueue_assets' ] );
		
		// AJAX endpoints
		add_action( 'wp_ajax_kfir_agent_create_customer', [ $this, 'ajax_create_customer' ] );
		add_action( 'wp_ajax_kfir_agent_search_customers', [ $this, 'ajax_search_customers' ] );
		add_action( 'wp_ajax_kfir_agent_search_products', [ $this, 'ajax_search_products' ] );
		add_action( 'wp_ajax_kfir_agent_get_customer_orders', [ $this, 'ajax_get_customer_orders' ] );
		add_action( 'wp_ajax_kfir_agent_get_product_details', [ $this, 'ajax_get_product_details' ] );
		add_action( 'wp_ajax_kfir_agent_calculate_total', [ $this, 'ajax_calculate_total' ] );
		add_action( 'wp_ajax_kfir_agent_create_order', [ $this, 'ajax_create_order' ] );
	}

	/**
	 * רישום תפקיד "סוכן"
	 */
	public function register_agent_role() {
		add_role(
			'agent',
			'סוכן',
			[
				'read' => true,
				'create_customers' => true,
				'create_orders_for_customers' => true,
			]
		);
	}

	/**
	 * בדיקה אם המשתמש הנוכחי הוא סוכן או אדמין
	 */
	private function is_agent_page() {
		if ( ! is_user_logged_in() ) {
			return false;
		}
		
		$user = wp_get_current_user();
		return in_array( 'agent', $user->roles ) || in_array( 'administrator', $user->roles );
	}

	/**
	 * טעינת קבצי CSS ו-JS
	 */
	public function enqueue_assets() {
		if ( ! $this->is_agent_page() ) {
			return;
		}

		// טעינת Select2
		wp_enqueue_style( 'select2' );
		wp_enqueue_script( 'select2' );

		// טעינת קבצי המערכת
		wp_enqueue_style(
			'kfir-agent-css',
			get_stylesheet_directory_uri() . '/inc/lib/custom-pricing/assets/kfir-cp-agent.css',
			[],
			'1.0.0'
		);

		wp_enqueue_script(
			'kfir-agent-js',
			get_stylesheet_directory_uri() . '/inc/lib/custom-pricing/assets/kfir-cp-agent.js',
			[ 'jquery', 'select2' ],
			'1.0.0',
			true
		);

		wp_localize_script( 'kfir-agent-js', 'kfirAgentData', [
			'ajaxurl' => admin_url( 'admin-ajax.php' ),
			'nonce' => wp_create_nonce( 'kfir_agent_nonce' ),
			'strings' => [
				'selectCustomer' => 'בחר לקוח',
				'searchProducts' => 'חפש מוצרים...',
				'noResults' => 'לא נמצאו תוצאות',
				'error' => 'אירעה שגיאה',
				'success' => 'הפעולה בוצעה בהצלחה',
			],
		] );
	}

	/**
	 * רינדור הממשק הראשי
	 */
	public function render_interface() {
		if ( ! $this->is_agent_page() ) {
			return '<div class="kfir-agent-error">אין לך הרשאה לגשת לממשק זה</div>';
		}

		ob_start();
		?>
		<div class="kfir-agent-wrap">
			<!-- מסך 1: Dashboard -->
			<div class="kfir-screen" id="screen-dashboard">
				<div class="kfir-agent-dashboard">
					<h2>ממשק ניהול הזמנות</h2>
					<div class="kfir-agent-buttons">
						<button class="kfir-btn-primary" data-screen="new-order">
							🛒 הזמנה חדשה
						</button>
						<button class="kfir-btn-secondary" data-screen="new-customer">
							👤 הוסף לקוח חדש
						</button>
					</div>
				</div>
			</div>

			<!-- מסך 2: טופס לקוח חדש -->
			<div class="kfir-screen" id="screen-new-customer" style="display: none;">
				<div class="kfir-agent-card">
					<h2>הוסף לקוח חדש</h2>
					<form id="new-customer-form" class="kfir-agent-form">
						<div class="kfir-form-group">
							<label>שם פרטי *</label>
							<input type="text" name="first_name" required>
						</div>
						<div class="kfir-form-group">
							<label>שם משפחה *</label>
							<input type="text" name="last_name" required>
						</div>
						<div class="kfir-form-group">
							<label>טלפון נייד *</label>
							<input type="tel" name="phone" required>
						</div>
						<div class="kfir-form-group">
							<label>אימייל *</label>
							<input type="email" name="email" required>
						</div>
						<div class="kfir-form-group">
							<label>שם העסק</label>
							<input type="text" name="business_name">
						</div>
						<div class="kfir-form-group">
							<label>עיר</label>
							<input type="text" name="city">
						</div>
						<div class="kfir-form-group">
							<label>ח.פ / ע.מ</label>
							<input type="text" name="vat_id">
						</div>
						<div class="kfir-form-group">
							<label>תמונה/קובץ</label>
							<input type="file" name="document" accept="image/*,.pdf">
						</div>
						<div class="kfir-form-actions">
							<button type="submit" class="kfir-btn-primary">שמור לקוח</button>
							<button type="button" class="kfir-btn-secondary" data-screen="dashboard">ביטול</button>
						</div>
					</form>
				</div>
			</div>

			<!-- מסך 3: איתור לקוח -->
			<div class="kfir-screen" id="screen-find-customer" style="display: none;">
				<div class="kfir-agent-card">
					<h2>חפש לקוח</h2>
					<div class="kfir-form-group">
						<input type="text" id="customer-search" placeholder="חפש לקוח (שם / טלפון)" class="kfir-search-input">
					</div>
					<div id="customer-results" class="kfir-customer-results"></div>
					<div class="kfir-form-actions">
						<button type="button" class="kfir-btn-secondary" data-screen="dashboard">חזור</button>
					</div>
				</div>
			</div>

			<!-- מסך 4: יצירת הזמנה -->
			<div class="kfir-screen" id="screen-new-order" style="display: none;">
				<div class="kfir-agent-card">
					<div class="order-header">
						<div class="customer-info">
							<strong>לקוח:</strong> <span id="selected-customer-name">-</span>
						</div>
						<button class="cancel-order kfir-btn-secondary" data-screen="dashboard">❌ ביטול הזמנה</button>
					</div>

					<div class="kfir-form-group">
						<label>חפש מוצרים</label>
						<select id="product-search" class="kfir-select" data-placeholder="חפש מוצר או SKU..."></select>
					</div>

					<div id="purchased-products-section" class="kfir-products-section" style="display: none;">
						<h3>מוצרים שנרכשו בעבר</h3>
						<div id="purchased-products-list" class="kfir-products-list"></div>
					</div>

					<div id="all-products-section" class="kfir-products-section">
						<h3>כל המוצרים</h3>
						<div id="all-products-list" class="kfir-products-list"></div>
					</div>

					<div class="order-summary">
						<div class="total">סה"כ: ₪<span id="order-total">0.00</span></div>
						<button class="proceed-checkout kfir-btn-primary">➡️ המשך לתשלום</button>
					</div>
				</div>
			</div>

			<!-- מסך 5: סיכום הזמנה -->
			<div class="kfir-screen" id="screen-checkout" style="display: none;">
				<div class="kfir-agent-card">
					<h2>סיכום הזמנה</h2>
					<div class="customer-info-summary">
						<strong>לקוח:</strong> <span id="checkout-customer-name">-</span>
					</div>

					<table class="order-items-table">
						<thead>
							<tr>
								<th>מוצר</th>
								<th>מחיר יחידה</th>
								<th>כמות</th>
								<th>סה"כ</th>
								<th>פעולות</th>
							</tr>
						</thead>
						<tbody id="checkout-items">
							<!-- ימולא ב-JavaScript -->
						</tbody>
					</table>

					<div class="payment-methods">
						<h3>שיטת תשלום</h3>
						<div id="payment-methods-list">
							<?php
							$payment_gateways = WC()->payment_gateways->get_available_payment_gateways();
							foreach ( $payment_gateways as $gateway ) {
								echo '<label class="payment-method-option">';
								echo '<input type="radio" name="payment_method" value="' . esc_attr( $gateway->id ) . '">';
								echo esc_html( $gateway->get_title() );
								echo '</label>';
							}
							?>
						</div>
					</div>

					<div class="checkout-summary">
						<div class="total">סה"כ: ₪<span id="checkout-total">0.00</span></div>
						<div class="checkout-actions">
							<button class="back-to-order kfir-btn-secondary" data-screen="new-order">⬅️ חזור להזמנה</button>
							<button class="finalize-order kfir-btn-primary">✅ סיים הזמנה</button>
						</div>
					</div>
				</div>
			</div>

			<!-- מסך 6: הזמנה הושלמה -->
			<div class="kfir-screen" id="screen-order-success" style="display: none;">
				<div class="kfir-agent-card order-success">
					<h2>✅ ההזמנה הושלמה בהצלחה!</h2>
					<p>מספר הזמנה: <strong id="order-number">-</strong></p>
					<p>לקוח: <strong id="success-customer-name">-</strong></p>
					<p>סה"כ: <strong id="success-order-total">₪0.00</strong></p>
					<button class="back-to-dashboard kfir-btn-primary" data-screen="dashboard">חזור למסך ראשי</button>
				</div>
			</div>
		</div>
		<?php
		return ob_get_clean();
	}

	/**
	 * AJAX: יצירת לקוח חדש
	 */
	public function ajax_create_customer() {
		check_ajax_referer( 'kfir_agent_nonce', 'nonce' );
		
		if ( ! $this->is_agent_page() ) {
			wp_send_json_error( [ 'message' => 'אין לך הרשאה' ] );
		}

		$first_name = sanitize_text_field( $_POST['first_name'] ?? '' );
		$last_name = sanitize_text_field( $_POST['last_name'] ?? '' );
		$phone = sanitize_text_field( $_POST['phone'] ?? '' );
		$email = sanitize_email( $_POST['email'] ?? '' );
		$business_name = sanitize_text_field( $_POST['business_name'] ?? '' );
		$city = sanitize_text_field( $_POST['city'] ?? '' );
		$vat_id = sanitize_text_field( $_POST['vat_id'] ?? '' );

		// Validation
		if ( empty( $first_name ) || empty( $last_name ) || empty( $phone ) || empty( $email ) ) {
			wp_send_json_error( [ 'message' => 'יש למלא את כל השדות החובה' ] );
		}

		if ( ! is_email( $email ) ) {
			wp_send_json_error( [ 'message' => 'אימייל לא תקין' ] );
		}

		// בדיקה אם המשתמש כבר קיים
		$existing_user = get_user_by( 'email', $email );
		if ( $existing_user ) {
			wp_send_json_error( [ 'message' => 'משתמש עם האימייל הזה כבר קיים' ] );
		}

		// העלאת קובץ
		$attachment_id = 0;
		if ( ! empty( $_FILES['document']['name'] ) ) {
			if ( ! function_exists( 'media_handle_upload' ) ) {
				require_once ABSPATH . 'wp-admin/includes/file.php';
				require_once ABSPATH . 'wp-admin/includes/media.php';
				require_once ABSPATH . 'wp-admin/includes/image.php';
			}
			
			$uploaded = media_handle_upload( 'document', 0 );
			if ( ! is_wp_error( $uploaded ) ) {
				$attachment_id = $uploaded;
			}
		}

		// יצירת משתמש
		$password = wp_generate_password();
		$user_id = wp_create_user( $email, $password, $email );

		if ( is_wp_error( $user_id ) ) {
			wp_send_json_error( [ 'message' => 'שגיאה ביצירת משתמש: ' . $user_id->get_error_message() ] );
		}

		// עדכון פרטים בסיסיים
		wp_update_user( [
			'ID' => $user_id,
			'first_name' => $first_name,
			'last_name' => $last_name,
			'display_name' => $business_name ?: ( $first_name . ' ' . $last_name ),
			'role' => 'customer',
		] );

		// WooCommerce billing fields
		update_user_meta( $user_id, 'billing_first_name', $first_name );
		update_user_meta( $user_id, 'billing_last_name', $last_name );
		update_user_meta( $user_id, 'billing_email', $email );
		update_user_meta( $user_id, 'billing_phone', $phone );
		update_user_meta( $user_id, 'billing_company', $business_name );
		update_user_meta( $user_id, 'billing_city', $city );
		update_user_meta( $user_id, 'billing_country', 'IL' );

		// Custom meta fields
		if ( $vat_id ) {
			update_user_meta( $user_id, '_vat_id', $vat_id );
		}
		if ( $attachment_id ) {
			update_user_meta( $user_id, '_document_id', $attachment_id );
		}

		// אם multisite - שמירת פרטי האתר
		if ( is_multisite() ) {
			update_user_meta( $user_id, '_created_site_id', get_current_blog_id() );
		}

		// שליחת מייל WooCommerce למשתמש חדש
		if ( class_exists( 'WC_Emails' ) ) {
			$wc_emails = WC()->mailer();
			if ( method_exists( $wc_emails, 'customer_new_account' ) ) {
				$wc_emails->customer_new_account( $user_id, $password, true );
			}
		}

		wp_send_json_success( [
			'user_id' => $user_id,
			'message' => 'הלקוח נוצר בהצלחה',
			'customer_name' => $business_name ?: ( $first_name . ' ' . $last_name ),
		] );
	}

	/**
	 * AJAX: חיפוש לקוחות
	 */
	public function ajax_search_customers() {
		check_ajax_referer( 'kfir_agent_nonce', 'nonce' );
		
		if ( ! $this->is_agent_page() ) {
			wp_send_json_error( [ 'message' => 'אין לך הרשאה' ] );
		}

		$search_term = sanitize_text_field( $_GET['q'] ?? '' );
		if ( empty( $search_term ) ) {
			wp_send_json( [ 'results' => [] ] );
		}

		$args = [
			'role' => 'customer',
			'search' => '*' . $search_term . '*',
			'search_columns' => [ 'user_login', 'user_email', 'display_name' ],
			'number' => 20,
		];

		$users = get_users( $args );

		// חיפוש גם לפי meta (טלפון)
		$meta_users = get_users( [
			'role' => 'customer',
			'meta_query' => [
				[
					'key' => 'billing_phone',
					'value' => $search_term,
					'compare' => 'LIKE',
				],
			],
			'number' => 20,
		] );

		// איחוד התוצאות
		$all_users = array_merge( $users, $meta_users );
		$unique_users = [];
		$seen_ids = [];

		foreach ( $all_users as $user ) {
			if ( ! in_array( $user->ID, $seen_ids ) ) {
				$seen_ids[] = $user->ID;
				$unique_users[] = $user;
			}
		}

		$results = [];
		foreach ( $unique_users as $user ) {
			$business_name = get_user_meta( $user->ID, 'billing_company', true ) ?: $user->display_name;
			$phone = get_user_meta( $user->ID, 'billing_phone', true ) ?: '';
			$first_name = get_user_meta( $user->ID, 'billing_first_name', true ) ?: $user->first_name;
			$last_name = get_user_meta( $user->ID, 'billing_last_name', true ) ?: $user->last_name;
			
			$results[] = [
				'id' => $user->ID,
				'text' => $business_name . ' - ' . $first_name . ' ' . $last_name . ( $phone ? ' | ' . $phone : '' ),
				'business_name' => $business_name,
				'name' => $first_name . ' ' . $last_name,
				'phone' => $phone,
			];
		}

		wp_send_json( [ 'results' => $results ] );
	}

	/**
	 * AJAX: חיפוש מוצרים
	 */
	public function ajax_search_products() {
		check_ajax_referer( 'kfir_agent_nonce', 'nonce' );
		
		if ( ! $this->is_agent_page() ) {
			wp_send_json_error( [ 'message' => 'אין לך הרשאה' ] );
		}

		$q = sanitize_text_field( $_GET['q'] ?? '' );

		$results = [];
		
		// חיפוש לפי SKU
		$sku_query = new WP_Query( [
			'post_type' => [ 'product', 'product_variation' ],
			'posts_per_page' => 15,
			'suppress_filters' => true,
			'meta_query' => [
				[
					'key' => '_sku',
					'value' => $q,
					'compare' => 'LIKE',
				],
			],
		] );

		$ids = [];
		foreach ( $sku_query->posts as $p ) {
			$ids[] = $p->ID;
		}

		// חיפוש לפי שם
		$title_query = new WP_Query( [
			'post_type' => [ 'product', 'product_variation' ],
			's' => $q,
			'post__not_in' => $ids,
			'posts_per_page' => 15,
			'suppress_filters' => true,
		] );

		$posts = array_merge( $sku_query->posts, $title_query->posts );

		foreach ( $posts as $p ) {
			$prod = wc_get_product( $p->ID );
			if ( ! $prod ) continue;
			
			if ( $prod->is_type( 'variation' ) ) {
				$parent = wc_get_product( $prod->get_parent_id() );
				$label = $parent ? $parent->get_name() : __( 'Variation', 'woocommerce' );
				
				// קבלת תכונות הוריאציה
				$variation_attributes = $prod->get_variation_attributes();
				$formatted_attrs = [];
				
				foreach ( $variation_attributes as $attr_name => $attr_value ) {
					if ( empty( $attr_value ) ) continue;
					
					// אם הערך הוא slug, ננסה לקבל את השם מהטרמינולוגיה
					$display_value = $attr_value;
					
					// בדיקה אם זה taxonomy (pa_)
					if ( strpos( $attr_name, 'pa_' ) === 0 ) {
						$term = get_term_by( 'slug', $attr_value, $attr_name );
						if ( $term && ! is_wp_error( $term ) ) {
							$display_value = $term->name;
						}
					} elseif ( strpos( $attr_name, 'attribute_' ) === 0 ) {
						// זה custom attribute - נשתמש בערך ישירות
						$display_value = $attr_value;
					}
					
					$formatted_attrs[] = $display_value;
				}
				
				$attrs_text = ! empty( $formatted_attrs ) ? implode( ', ', $formatted_attrs ) : '';
				$text = $attrs_text ? sprintf( '%s — %s', $label, $attrs_text ) : $label;
			} else {
				$text = $prod->get_name();
			}
			
			$results[] = [
				'id' => $prod->get_id(),
				'text' => $text . '  #' . $prod->get_id(),
			];
		}

		wp_send_json( [ 'results' => $results ] );
	}

	/**
	 * AJAX: קבלת הזמנות קודמות של לקוח
	 */
	public function ajax_get_customer_orders() {
		check_ajax_referer( 'kfir_agent_nonce', 'nonce' );
		
		if ( ! $this->is_agent_page() ) {
			wp_send_json_error( [ 'message' => 'אין לך הרשאה' ] );
		}

		$customer_id = absint( $_POST['customer_id'] ?? 0 );
		if ( ! $customer_id ) {
			wp_send_json_error( [ 'message' => 'לא נבחר לקוח' ] );
		}

		$customer_orders = wc_get_orders( [
			'customer_id' => $customer_id,
			'limit' => -1,
		] );

		$purchased_products = [];
		foreach ( $customer_orders as $order ) {
			foreach ( $order->get_items() as $item ) {
				$product_id = $item->get_product_id();
				if ( ! in_array( $product_id, $purchased_products ) ) {
					$purchased_products[] = $product_id;
				}
			}
		}

		$products_data = [];
		foreach ( $purchased_products as $product_id ) {
			$product = wc_get_product( $product_id );
			if ( ! $product ) continue;

			$pricing = new KFIR_Custom_Pricing();
			$custom_price = $pricing->get_customer_price( $customer_id, $product_id );

			$products_data[] = [
				'id' => $product_id,
				'name' => $product->get_name(),
				'sku' => $product->get_sku(),
				'price' => $custom_price ?: $product->get_price(),
				'custom_price' => $custom_price,
			];
		}

		wp_send_json_success( [ 'products' => $products_data ] );
	}

	/**
	 * AJAX: קבלת פרטי מוצר
	 */
	public function ajax_get_product_details() {
		check_ajax_referer( 'kfir_agent_nonce', 'nonce' );
		
		if ( ! $this->is_agent_page() ) {
			wp_send_json_error( [ 'message' => 'אין לך הרשאה' ] );
		}

		$product_id = absint( $_GET['product_id'] ?? 0 );
		if ( ! $product_id ) {
			wp_send_json_error( [ 'message' => 'לא נבחר מוצר' ] );
		}

		$product = wc_get_product( $product_id );
		if ( ! $product ) {
			wp_send_json_error( [ 'message' => 'מוצר לא נמצא' ] );
		}

		$price = $product->get_price();
		$customer_id = absint( $_GET['customer_id'] ?? 0 );
		if ( $customer_id ) {
			$pricing = new KFIR_Custom_Pricing();
			$custom_price = $pricing->get_customer_price( $customer_id, $product_id );
			if ( $custom_price ) {
				$price = $custom_price;
			}
		}

		wp_send_json_success( [
			'id' => $product_id,
			'name' => $product->get_name(),
			'sku' => $product->get_sku(),
			'price' => $price,
		] );
	}

	/**
	 * AJAX: חישוב סה"כ
	 */
	public function ajax_calculate_total() {
		check_ajax_referer( 'kfir_agent_nonce', 'nonce' );
		
		if ( ! $this->is_agent_page() ) {
			wp_send_json_error( [ 'message' => 'אין לך הרשאה' ] );
		}

		$items = isset( $_POST['items'] ) ? (array) $_POST['items'] : [];
		$total = 0;

		foreach ( $items as $item ) {
			$price = floatval( $item['price'] ?? 0 );
			$quantity = intval( $item['quantity'] ?? 1 );
			$total += $price * $quantity;
		}

		wp_send_json_success( [ 'total' => $total ] );
	}

	/**
	 * AJAX: יצירת הזמנה
	 */
	public function ajax_create_order() {
		check_ajax_referer( 'kfir_agent_nonce', 'nonce' );
		
		if ( ! $this->is_agent_page() ) {
			wp_send_json_error( [ 'message' => 'אין לך הרשאה' ] );
		}

		$customer_id = absint( $_POST['customer_id'] ?? 0 );
		$items = isset( $_POST['items'] ) ? (array) $_POST['items'] : [];
		$payment_method = sanitize_text_field( $_POST['payment_method'] ?? '' );

		if ( ! $customer_id || empty( $items ) ) {
			wp_send_json_error( [ 'message' => 'חסרים פרטים' ] );
		}

		// יצירת הזמנה
		$order = wc_create_order( [
			'customer_id' => $customer_id,
			'status' => 'pending',
		] );

		if ( is_wp_error( $order ) ) {
			wp_send_json_error( [ 'message' => 'שגיאה ביצירת הזמנה: ' . $order->get_error_message() ] );
		}

		// הוספת מוצרים
		foreach ( $items as $item_data ) {
			$product_id = absint( $item_data['id'] ?? 0 );
			$quantity = intval( $item_data['quantity'] ?? 1 );
			$price = wc_format_decimal( $item_data['price'] ?? 0 );

			$product = wc_get_product( $product_id );
			if ( ! $product ) continue;

			$order->add_product( $product, $quantity, [
				'subtotal' => $price * $quantity,
				'total' => $price * $quantity,
			] );

			// שמירת מחיר מותאם
			$pricing = new KFIR_Custom_Pricing();
			$pricing->set_customer_price( $customer_id, $product_id, $price );
		}

		// הגדרת שיטת תשלום
		if ( $payment_method ) {
			$order->set_payment_method( $payment_method );
		}

		// חישוב סיכומים
		$order->calculate_totals();
		$order->save();

		wp_send_json_success( [
			'order_id' => $order->get_id(),
			'order_number' => $order->get_order_number(),
			'total' => $order->get_total(),
		] );
	}
}

new KFIR_Custom_Pricing_Agent();
