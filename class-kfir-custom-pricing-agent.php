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
		add_filter( 'body_class', [ $this, 'add_agent_body_class' ] );
		
		// AJAX endpoints
		add_action( 'wp_ajax_kfir_agent_create_customer', [ $this, 'ajax_create_customer' ] );
		add_action( 'wp_ajax_kfir_agent_search_customers', [ $this, 'ajax_search_customers' ] );
		add_action( 'wp_ajax_kfir_agent_search_products', [ $this, 'ajax_search_products' ] );
		add_action( 'wp_ajax_kfir_agent_get_categories', [ $this, 'ajax_get_categories' ] );
		add_action( 'wp_ajax_kfir_agent_get_products_by_category', [ $this, 'ajax_get_products_by_category' ] );
		add_action( 'wp_ajax_kfir_agent_get_customer_orders', [ $this, 'ajax_get_customer_orders' ] );
		add_action( 'wp_ajax_kfir_agent_get_product_details', [ $this, 'ajax_get_product_details' ] );
		add_action( 'wp_ajax_kfir_agent_calculate_total', [ $this, 'ajax_calculate_total' ] );
		add_action( 'wp_ajax_kfir_agent_create_order', [ $this, 'ajax_create_order' ] );
		add_action( 'wp_ajax_kfir_agent_get_shipping_cost', [ $this, 'ajax_get_shipping_cost' ] );
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
		// אם המשתמש לא מחובר, נאפשר גישה רק למסך התחברות
		if ( ! is_user_logged_in() ) {
			return true; // נאפשר גישה לממשק גם למשתמשים לא מחוברים (למסך התחברות)
		}
		
		$user = wp_get_current_user();
		return in_array( 'agent', $user->roles ) || in_array( 'administrator', $user->roles );
	}

	/**
	 * הוספת class ל-body כאשר יש shortcode של סוכנים
	 */
	public function add_agent_body_class( $classes ) {
		global $post;
		
		if ( ! $this->is_agent_page() ) {
			return $classes;
		}
		
		// בדיקה אם יש shortcode בעמוד/פוסט הנוכחי
		if ( $post && has_shortcode( $post->post_content, 'kfir_agent_interface' ) ) {
			$classes[] = 'kfir-agent-page';
		}
		
		return $classes;
	}

	/**
	 * טעינת קבצי CSS ו-JS
	 */
	public function enqueue_assets() {
		// בדיקה אם יש shortcode בעמוד הנוכחי
		global $post;
		if ( ! $post || ! has_shortcode( $post->post_content, 'kfir_agent_interface' ) ) {
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

		// טעינת סקריפטים וסגנונות של SMS auth אם המערכת פעילה
		if ( class_exists( 'OC_SMS_Auth' ) && OC_SMS_Auth::is_active() ) {
			$sms_auth = OC_SMS_Auth::get_instance();
			$sms_auth->enqueue_scripts();
		}

		wp_localize_script( 'kfir-agent-js', 'kfirAgentData', [
			'ajaxurl' => admin_url( 'admin-ajax.php' ),
			'nonce' => wp_create_nonce( 'kfir_agent_nonce' ),
			'placeholder_img' => wc_placeholder_img_src( 'thumbnail' ),
			'is_logged_in' => is_user_logged_in(),
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
		// אם המשתמש לא מחובר, נציג רק את מסך ההתחברות
		if ( ! is_user_logged_in() ) {
			ob_start();
			?>
			<div class="kfir-agent-wrap kfir-agent-page">
				<!-- מסך התחברות -->
				<div class="kfir-screen" id="screen-login">
					<div class="kfir-agent-card">
						<h2>התחברות לממשק סוכנים</h2>
						<?php
						// הצגת טופס SMS auth
						if ( class_exists( 'OC_SMS_Auth' ) && OC_SMS_Auth::is_active() ) {
							$sms_auth = OC_SMS_Auth::get_instance();
							$sms_auth->add_sms_login_option();
						} else {
							echo '<p>מערכת ההתחברות אינה פעילה כרגע.</p>';
						}
						?>
						<div class="kfir-form-actions" style="margin-top: 20px;">
							<a href="<?php echo esc_url( home_url( '/' ) ); ?>" class="kfir-btn-secondary">🏠 בחזרה לאתר</a>
						</div>
					</div>
				</div>
			</div>
			<?php
			return ob_get_clean();
		}

		// בדיקה אם המשתמש הוא סוכן או אדמין
		if ( ! $this->is_agent_page() ) {
			return '<div class="kfir-agent-error">אין לך הרשאה לגשת לממשק זה</div>';
		}

		ob_start();
		?>
		<div class="kfir-agent-wrap kfir-agent-page">
			<!-- Lightbox לתמונות מוצרים -->
			<div class="kfir-lightbox-overlay" style="display: none;">
				<div class="kfir-lightbox-content">
					<button class="kfir-lightbox-close">×</button>
					<img class="kfir-lightbox-image" src="" alt="">
				</div>
			</div>

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
							<label>כתובת עסק</label>
							<input type="text" name="business_address">
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
						<span class="customer-info"><strong>לקוח:</strong> <span id="selected-customer-name">-</span></span>
						<button class="cancel-order kfir-btn-secondary" data-screen="dashboard">❌ ביטול הזמנה</button>
					</div>

					<div class="kfir-product-browse-tabs">
						<button type="button" class="kfir-tab-btn active" data-tab="categories">📁 קטגוריות</button>
						<button type="button" class="kfir-tab-btn" data-tab="search">🔍 חיפוש מוצרים</button>
						<button type="button" class="kfir-tab-btn" data-tab="purchased">📦 מוצרים שנרכשו בעבר</button>
					</div>

					<div id="categories-panel" class="kfir-tab-panel">
						<div id="categories-list" class="kfir-categories-list"></div>
						<div id="category-products-wrap" class="kfir-category-products-wrap" style="display: none;">
							<h4 id="category-products-title" class="kfir-category-products-title"></h4>
							<div id="category-products-list" class="kfir-products-list"></div>
						</div>
					</div>

					<div id="search-panel" class="kfir-tab-panel" style="display: none;">
						<div class="kfir-form-group">
							<label>חפש מוצרים</label>
							<select id="product-search" class="kfir-select" data-placeholder="חפש מוצר או SKU..."></select>
						</div>
						<div id="all-products-section" class="kfir-products-section">
							<h3>כל המוצרים</h3>
							<div id="all-products-list" class="kfir-products-list"></div>
						</div>
					</div><!-- #search-panel -->

					<div id="purchased-panel" class="kfir-tab-panel" style="display: none;">
						<div id="purchased-products-section" class="kfir-products-section">
							<div id="purchased-products-list" class="kfir-products-list"></div>
						</div>
					</div><!-- #purchased-panel -->

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
								<th>מחיר</th>
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

					<div class="shipping-methods">
						<h3>שיטת משלוח</h3>
						<div id="shipping-methods-list">
							<?php
							// קבלת כל שיטות המשלוח הזמינות מאזורי המשלוח
							$shipping_zones = WC_Shipping_Zones::get_zones();
							$all_methods = [];
							
							// איסוף שיטות משלוח מכל האזורים
							foreach ( $shipping_zones as $zone ) {
								foreach ( $zone['shipping_methods'] as $method ) {
									if ( $method->enabled === 'yes' ) {
										$method_id = $method->id;
										$method_title = $method->get_title() ?: $method->get_method_title();
										
									// קבלת מחיר המשלוח
									$method_cost = 0;
									
									// ניסיון לקבל מחיר לפי סוג השיטה
									if ( method_exists( $method, 'get_option' ) ) {
										$method_cost = $method->get_option( 'cost', 0 );
									}
									
									// אם אין מחיר, ננסה לקבל ישירות
									if ( empty( $method_cost ) && isset( $method->cost ) ) {
										$method_cost = $method->cost;
									}
									
									// אם עדיין אין מחיר, ננסה get_cost
									if ( empty( $method_cost ) && method_exists( $method, 'get_cost' ) ) {
										$method_cost = $method->get_cost();
									}
									
									// אם זה free_shipping, המחיר הוא 0
									if ( $method_id === 'free_shipping' ) {
										$method_cost = 0;
									}
									
									// המרה למספר
									$method_cost = floatval( $method_cost );
										
										$all_methods[ $method_id ] = [
											'title' => $method_title,
											'cost' => floatval( $method_cost )
										];
									}
								}
							}
							
							// הוספת שיטות משלוח מאזור ברירת המחדל (Rest of the World)
							$default_zone = new WC_Shipping_Zone( 0 );
							foreach ( $default_zone->get_shipping_methods( true ) as $method ) {
								if ( $method->enabled === 'yes' ) {
									$method_id = $method->id;
									$method_title = $method->get_title() ?: $method->get_method_title();
									
									// קבלת מחיר המשלוח
									$method_cost = 0;
									
									// ניסיון לקבל מחיר לפי סוג השיטה
									if ( method_exists( $method, 'get_option' ) ) {
										$method_cost = $method->get_option( 'cost', 0 );
									}
									
									// אם אין מחיר, ננסה לקבל ישירות
									if ( empty( $method_cost ) && isset( $method->cost ) ) {
										$method_cost = $method->cost;
									}
									
									// אם עדיין אין מחיר, ננסה get_cost
									if ( empty( $method_cost ) && method_exists( $method, 'get_cost' ) ) {
										$method_cost = $method->get_cost();
									}
									
									// אם זה free_shipping, המחיר הוא 0
									if ( $method_id === 'free_shipping' ) {
										$method_cost = 0;
									}
									
									// המרה למספר
									$method_cost = floatval( $method_cost );
									
									$all_methods[ $method_id ] = [
										'title' => $method_title,
										'cost' => floatval( $method_cost )
									];
								}
							}
							
							// אם אין שיטות משלוח, נוסיף אפשרות ידנית
							if ( empty( $all_methods ) ) {
								$all_methods['manual'] = [
									'title' => 'משלוח ידני',
									'cost' => 0
								];
							}
							
							foreach ( $all_methods as $method_id => $method_data ) {
								$method_title = is_array( $method_data ) ? $method_data['title'] : $method_data;
								$method_cost = is_array( $method_data ) ? ( $method_data['cost'] ?? 0 ) : 0;
								
								echo '<label class="shipping-method-option">';
								echo '<input type="radio" name="shipping_method" value="' . esc_attr( $method_id ) . '" data-method-id="' . esc_attr( $method_id ) . '" data-shipping-cost="' . esc_attr( $method_cost ) . '">';
								echo esc_html( $method_title );
								echo '</label>';
							}
							?>
						</div>
						<div class="shipping-cost-input" style="margin-top: 15px; display: none;">
							<label>דמי משלוח (₪)</label>
							<input type="number" id="shipping-cost" name="shipping_cost" value="0" step="0.01" min="0" style="width: 100%; padding: 8px; margin-top: 5px;">
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
		$business_address = sanitize_text_field( $_POST['business_address'] ?? '' );
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
		update_user_meta( $user_id, 'billing_address_1', $business_address );
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

		// קבלת ID האתר הנוכחי במולטיסייט
		$current_blog_id = is_multisite() ? get_current_blog_id() : null;
		// בניית meta_query בסיסי
		$base_meta_query = [];
		
		// אם זה מולטיסייט, נסנן רק משתמשים שנוצרו באתר הנוכחי
		if ( is_multisite() && $current_blog_id ) {
			$base_meta_query[] = [
				'relation' => 'OR',
				[
					'key' => '_created_site_id',
					'value' => $current_blog_id,
					'compare' => '=',
				],
				// גם משתמשים ללא _created_site_id (לקוחות ישנים) - נכלול אותם רק אם הם באתר הנוכחי
				[
					'key' => '_created_site_id',
					'compare' => 'NOT EXISTS',
				],
			];
		}
		$args = [
//			'role' => 'customer',
			'search' => '*' . $search_term . '*',
			'search_columns' => [ 'user_login', 'user_email', 'display_name' ],
			'number' => 20,
		];

		// הוספת meta_query אם יש
		if ( ! empty( $base_meta_query ) ) {
			$args['meta_query'] = $base_meta_query;
		}
//        var_dump($args);
//        die;
		$users = get_users( $args );

		// חיפוש גם לפי meta (טלפון, אימייל, שם עסק, ח.פ)
		$meta_query = [
			'relation' => 'AND',
			[
				'relation' => 'OR',
				[
					'key' => 'billing_phone',
					'value' => $search_term,
					'compare' => 'LIKE',
				],
				[
					'key' => '_phone',
					'value' => $search_term,
					'compare' => 'LIKE',
				],
				[
					'key' => 'billing_company',
					'value' => $search_term,
					'compare' => 'LIKE',
				],
				[
					'key' => '_business_name',
					'value' => $search_term,
					'compare' => 'LIKE',
				],
				[
					'key' => '_vat_id',
					'value' => $search_term,
					'compare' => 'LIKE',
				],
                [
                    'key' => 'billing_first_name',
                    'value' => $search_term,
                    'compare' => 'LIKE',
                ],
                [
                    'key' => 'billing_last_name',
                    'value' => $search_term,
                    'compare' => 'LIKE',
                ],

            ],
		];

		// הוספת סינון לפי אתר אם זה מולטיסייט
		if ( is_multisite() && $current_blog_id ) {
			$meta_query[] = [
				'relation' => 'OR',
				[
					'key' => '_created_site_id',
					'value' => $current_blog_id,
					'compare' => '=',
				],
				[
					'key' => '_created_site_id',
					'compare' => 'NOT EXISTS',
				],
			];
		}

		$meta_users = get_users( [
			'role' => 'customer',
			'meta_query' => $meta_query,
			'number' => 20,
		] );
//        var_dump($meta_query);
//        die;
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
		$current_blog_id = is_multisite() ? get_current_blog_id() : null;
		
		foreach ( $unique_users as $user ) {
			// סינון נוסף במולטיסייט - וודא שהמשתמש שייך לאתר הנוכחי
			if ( is_multisite() && $current_blog_id ) {
				$created_site_id = get_user_meta( $user->ID, '_created_site_id', true );
				// אם יש _created_site_id והוא שונה מהאתר הנוכחי, דלג על המשתמש
				if ( $created_site_id !== '' && intval( $created_site_id ) !== $current_blog_id ) {
					continue;
				}
			}
			
			// קבלת שם עסק - נבדוק גם billing_company וגם _business_name
			$business_name = get_user_meta( $user->ID, 'billing_company', true );
			if ( ! $business_name ) {
				$business_name = get_user_meta( $user->ID, '_business_name', true );
			}
			$business_name = $business_name ?: '';
			
			// קבלת טלפון - נבדוק גם billing_phone וגם _phone
			$phone = get_user_meta( $user->ID, 'billing_phone', true );
			if ( ! $phone ) {
				$phone = get_user_meta( $user->ID, '_phone', true );
			}
			$phone = $phone ?: '';
			
			$first_name = get_user_meta( $user->ID, 'billing_first_name', true ) ?: $user->first_name;
			$last_name = get_user_meta( $user->ID, 'billing_last_name', true ) ?: $user->last_name;
			
			// קבלת אימייל - נבדוק גם _email
			$email = $user->user_email;
			if ( ! $email ) {
				$email = get_user_meta( $user->ID, '_email', true ) ?: '';
			}
			
			// קבלת ח.פ
			$vat_id = get_user_meta( $user->ID, '_vat_id', true ) ?: '';
			
			// בניית טקסט תצוגה עם כל הפרטים
			$display_parts = [];
			if ( $business_name ) {
				$display_parts[] = $business_name;
			}
			if ( $first_name || $last_name ) {
				$display_parts[] = trim( $first_name . ' ' . $last_name );
			}
			if ( $phone ) {
				$display_parts[] = $phone;
			}
			if ( $vat_id ) {
				$display_parts[] = 'ח.פ: ' . $vat_id;
			}
			if ( $email ) {
				$display_parts[] = $email;
			}
			$display_text = implode( ' | ', $display_parts );
			
			$results[] = [
				'id' => $user->ID,
				'text' => $display_text,
				'business_name' => $business_name,
				'name' => trim( $first_name . ' ' . $last_name ),
				'phone' => $phone,
				'email' => $email,
				'vat_id' => $vat_id,
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
	 * AJAX: קבלת קטגוריות מוצרים (WooCommerce product_cat)
	 */
	public function ajax_get_categories() {
		check_ajax_referer( 'kfir_agent_nonce', 'nonce' );
		
		if ( ! $this->is_agent_page() ) {
			wp_send_json_error( [ 'message' => 'אין לך הרשאה' ] );
		}

		$parent_id = absint( $_GET['parent_id'] ?? 0 );

		$terms = get_terms( [
			'taxonomy'   => 'product_cat',
			'hide_empty' => false,
			'orderby'    => 'name',
			'order'      => 'ASC',
			'parent'     => $parent_id,
		] );

		if ( is_wp_error( $terms ) ) {
			wp_send_json_success( [ 'categories' => [], 'parent_id' => $parent_id ] );
			return;
		}

		$categories = [];
		foreach ( $terms as $term ) {
			// סינון החוצה את קטגוריית "uncategorized"
			if ( $term->slug === 'uncategorized' || strtolower( $term->name ) === 'uncategorized' ) {
				continue;
			}
			
			// בדיקה אם יש תת-קטגוריות
			$children = get_terms( [
				'taxonomy'   => 'product_cat',
				'hide_empty' => false,
				'parent'     => $term->term_id,
			] );
			$has_children = ! is_wp_error( $children ) && ! empty( $children );

			$categories[] = [
				'id'          => (int) $term->term_id,
				'name'        => $term->name,
				'count'       => (int) $term->count,
				'has_children' => $has_children,
			];
		}

		wp_send_json_success( [ 
			'categories' => $categories,
			'parent_id'  => $parent_id,
			'parent_name' => $parent_id > 0 ? get_term( $parent_id, 'product_cat' )->name : '',
		] );
	}

	/**
	 * AJAX: קבלת מוצרים לפי קטגוריה
	 */
	public function ajax_get_products_by_category() {
		check_ajax_referer( 'kfir_agent_nonce', 'nonce' );
		
		if ( ! $this->is_agent_page() ) {
			wp_send_json_error( [ 'message' => 'אין לך הרשאה' ] );
		}

		$category_id = absint( $_GET['category_id'] ?? 0 );
		$customer_id = absint( $_GET['customer_id'] ?? 0 );
		if ( ! $category_id ) {
			wp_send_json_error( [ 'message' => 'לא נבחרה קטגוריה' ] );
		}

		$query = new WP_Query( [
			'post_type'      => 'product',
			'posts_per_page' => 100,
			'post_status'    => 'publish',
			'tax_query'      => [
				[
					'taxonomy' => 'product_cat',
					'field'    => 'term_id',
					'terms'    => $category_id,
				],
			],
		] );

		$products_data = [];
		$pricing = $customer_id ? new KFIR_Custom_Pricing() : null;

		foreach ( $query->posts as $post ) {
			$product = wc_get_product( $post->ID );
			if ( ! $product || $product->is_type( 'variable' ) ) {
				continue;
			}
			$base_price = $product->get_price();
			$custom_price = null;
			if ( $pricing && $customer_id ) {
				$custom_price = $pricing->get_customer_price( $customer_id, $product->get_id() );
			}
			$image_id = $product->get_image_id();
			$image_url = $image_id ? wp_get_attachment_image_url( $image_id, 'thumbnail' ) : wc_placeholder_img_src( 'thumbnail' );
			$image_url_full = $image_id ? wp_get_attachment_image_url( $image_id, 'full' ) : '';
			$products_data[] = [
				'id'           => $product->get_id(),
				'name'         => $product->get_name(),
				'sku'          => $product->get_sku(),
				'price'        => $base_price ?: 0,
				'custom_price' => $custom_price,
				'image_url'    => $image_url ?: '',
				'image_url_full' => $image_url_full ?: '',
			];
		}

		wp_send_json_success( [ 'products' => $products_data ] );
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

			// קבלת תמונת המוצר
			$image_id = $product->get_image_id();
			$image_url = '';
			$image_url_full = '';
			if ( $image_id ) {
				$image_url = wp_get_attachment_image_url( $image_id, 'thumbnail' );
				$image_url_full = wp_get_attachment_image_url( $image_id, 'full' );
			} else {
				// אם אין תמונה, נשתמש בתמונת placeholder
				$image_url = wc_placeholder_img_src( 'thumbnail' );
			}

			$products_data[] = [
				'id' => $product_id,
				'name' => $product->get_name(),
				'sku' => $product->get_sku(),
				'price' => $custom_price ?: $product->get_price(),
				'custom_price' => $custom_price,
				'image_url' => $image_url,
				'image_url_full' => $image_url_full ?: '',
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

		$base_price = $product->get_price();
		$custom_price = null;
		$customer_id = absint( $_GET['customer_id'] ?? 0 );
		
		if ( $customer_id ) {
			$pricing = new KFIR_Custom_Pricing();
			$custom_price = $pricing->get_customer_price( $customer_id, $product_id );
		}

		// המחיר הסופי - מותאם אם קיים, אחרת בסיסי
		$final_price = $custom_price !== null ? $custom_price : $base_price;

		// קבלת תמונת המוצר
		$image_id = $product->get_image_id();
		$image_url = '';
		$image_url_full = '';
		if ( $image_id ) {
			$image_url = wp_get_attachment_image_url( $image_id, 'thumbnail' );
			$image_url_full = wp_get_attachment_image_url( $image_id, 'full' );
		} else {
			// אם אין תמונה, נשתמש בתמונת placeholder
			$image_url = wc_placeholder_img_src( 'thumbnail' );
		}

		wp_send_json_success( [
			'id' => $product_id,
			'name' => $product->get_name(),
			'sku' => $product->get_sku(),
			'price' => $base_price, // מחיר בסיסי
			'custom_price' => $custom_price, // מחיר מותאם (null אם אין)
			'final_price' => $final_price, // מחיר סופי לשימוש
			'image_url' => $image_url,
			'image_url_full' => $image_url_full ?: '',
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
		$shipping_method = sanitize_text_field( $_POST['shipping_method'] ?? '' );
		$shipping_cost = wc_format_decimal( $_POST['shipping_cost'] ?? 0 );

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

		// שיוך פרטי חיוב ומשלוח מהלקוח להזמנה
		$customer = get_userdata( $customer_id );
		if ( $customer ) {
			// פרטי חיוב (Billing)
			$billing_first_name = get_user_meta( $customer_id, 'billing_first_name', true ) ?: $customer->first_name;
			$billing_last_name = get_user_meta( $customer_id, 'billing_last_name', true ) ?: $customer->last_name;
			$billing_email = get_user_meta( $customer_id, 'billing_email', true ) ?: $customer->user_email;
			$billing_phone = get_user_meta( $customer_id, 'billing_phone', true );
			$billing_company = get_user_meta( $customer_id, 'billing_company', true );
			$billing_address_1 = get_user_meta( $customer_id, 'billing_address_1', true );
			$billing_city = get_user_meta( $customer_id, 'billing_city', true );
			$billing_postcode = get_user_meta( $customer_id, 'billing_postcode', true );
			$billing_country = get_user_meta( $customer_id, 'billing_country', true ) ?: 'IL';
			$billing_state = get_user_meta( $customer_id, 'billing_state', true );

			// הגדרת פרטי חיוב להזמנה
			if ( $billing_first_name ) $order->set_billing_first_name( $billing_first_name );
			if ( $billing_last_name ) $order->set_billing_last_name( $billing_last_name );
			if ( $billing_email ) $order->set_billing_email( $billing_email );
			if ( $billing_phone ) $order->set_billing_phone( $billing_phone );
			if ( $billing_company ) $order->set_billing_company( $billing_company );
			if ( $billing_address_1 ) $order->set_billing_address_1( $billing_address_1 );
			if ( $billing_city ) $order->set_billing_city( $billing_city );
			if ( $billing_postcode ) $order->set_billing_postcode( $billing_postcode );
			if ( $billing_country ) $order->set_billing_country( $billing_country );
			if ( $billing_state ) $order->set_billing_state( $billing_state );

			// פרטי משלוח (Shipping) - נשתמש באותם פרטים כמו חיוב אם אין פרטי משלוח נפרדים
			$shipping_first_name = get_user_meta( $customer_id, 'shipping_first_name', true ) ?: $billing_first_name;
			$shipping_last_name = get_user_meta( $customer_id, 'shipping_last_name', true ) ?: $billing_last_name;
			$shipping_company = get_user_meta( $customer_id, 'shipping_company', true ) ?: $billing_company;
			$shipping_address_1 = get_user_meta( $customer_id, 'shipping_address_1', true ) ?: $billing_address_1;
			$shipping_city = get_user_meta( $customer_id, 'shipping_city', true ) ?: $billing_city;
			$shipping_postcode = get_user_meta( $customer_id, 'shipping_postcode', true ) ?: $billing_postcode;
			$shipping_country = get_user_meta( $customer_id, 'shipping_country', true ) ?: $billing_country;
			$shipping_state = get_user_meta( $customer_id, 'shipping_state', true ) ?: $billing_state;

			// הגדרת פרטי משלוח להזמנה
			if ( $shipping_first_name ) $order->set_shipping_first_name( $shipping_first_name );
			if ( $shipping_last_name ) $order->set_shipping_last_name( $shipping_last_name );
			if ( $shipping_company ) $order->set_shipping_company( $shipping_company );
			if ( $shipping_address_1 ) $order->set_shipping_address_1( $shipping_address_1 );
			if ( $shipping_city ) $order->set_shipping_city( $shipping_city );
			if ( $shipping_postcode ) $order->set_shipping_postcode( $shipping_postcode );
			if ( $shipping_country ) $order->set_shipping_country( $shipping_country );
			if ( $shipping_state ) $order->set_shipping_state( $shipping_state );
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

		// הוספת שיטת משלוח ודמי משלוח
		if ( $shipping_method ) {
			// חיפוש שם השיטה מהאזורים
			$shipping_title = $shipping_method; // ברירת מחדל
			$shipping_zones = WC_Shipping_Zones::get_zones();
			foreach ( $shipping_zones as $zone ) {
				foreach ( $zone['shipping_methods'] as $method ) {
					if ( $method->id === $shipping_method && $method->enabled === 'yes' ) {
						$shipping_title = $method->get_title() ?: $method->get_method_title();
						break 2;
					}
				}
			}
			
			// אם לא נמצא, נבדוק באזור ברירת המחדל
			if ( $shipping_title === $shipping_method ) {
				$default_zone = new WC_Shipping_Zone( 0 );
				foreach ( $default_zone->get_shipping_methods( true ) as $method ) {
					if ( $method->id === $shipping_method && $method->enabled === 'yes' ) {
						$shipping_title = $method->get_title() ?: $method->get_method_title();
						break;
					}
				}
			}
			
			// יצירת shipping item
			$shipping_item = new WC_Order_Item_Shipping();
			$shipping_item->set_method_title( $shipping_title );
			$shipping_item->set_method_id( $shipping_method );
			$shipping_item->set_total( $shipping_cost );
			$order->add_item( $shipping_item );
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

	/**
	 * AJAX: קבלת מחיר משלוח
	 */
	public function ajax_get_shipping_cost() {
		check_ajax_referer( 'kfir_agent_nonce', 'nonce' );
		
		if ( ! $this->is_agent_page() ) {
			wp_send_json_error( [ 'message' => 'אין לך הרשאה' ] );
		}

		$method_id = sanitize_text_field( $_GET['method_id'] ?? '' );
		if ( ! $method_id ) {
			wp_send_json_error( [ 'message' => 'לא נבחרה שיטת משלוח' ] );
		}

		$cost = 0;
		
		// חיפוש שיטת המשלוח באזורים
		$shipping_zones = WC_Shipping_Zones::get_zones();
		foreach ( $shipping_zones as $zone ) {
			foreach ( $zone['shipping_methods'] as $method ) {
				if ( $method->id === $method_id && $method->enabled === 'yes' ) {
					// ניסיון לקבל מחיר לפי סוג השיטה
					if ( method_exists( $method, 'get_option' ) ) {
						$cost = $method->get_option( 'cost', 0 );
					}
					
					// אם אין מחיר, ננסה לקבל ישירות
					if ( empty( $cost ) && isset( $method->cost ) ) {
						$cost = $method->cost;
					}
					
					// אם עדיין אין מחיר, ננסה get_cost
					if ( empty( $cost ) && method_exists( $method, 'get_cost' ) ) {
						$cost = $method->get_cost();
					}
					
					// אם זה free_shipping, המחיר הוא 0
					if ( $method_id === 'free_shipping' ) {
						$cost = 0;
					}
					
					break 2;
				}
			}
		}
		
		// אם לא נמצא, נבדוק באזור ברירת המחדל
		if ( $cost == 0 ) {
			$default_zone = new WC_Shipping_Zone( 0 );
			foreach ( $default_zone->get_shipping_methods( true ) as $method ) {
				if ( $method->id === $method_id && $method->enabled === 'yes' ) {
					// ניסיון לקבל מחיר לפי סוג השיטה
					if ( method_exists( $method, 'get_option' ) ) {
						$cost = $method->get_option( 'cost', 0 );
					}
					
					// אם אין מחיר, ננסה לקבל ישירות
					if ( empty( $cost ) && isset( $method->cost ) ) {
						$cost = $method->cost;
					}
					
					// אם עדיין אין מחיר, ננסה get_cost
					if ( empty( $cost ) && method_exists( $method, 'get_cost' ) ) {
						$cost = $method->get_cost();
					}
					
					// אם זה free_shipping, המחיר הוא 0
					if ( $method_id === 'free_shipping' ) {
						$cost = 0;
					}
					
					break;
				}
			}
		}

		wp_send_json_success( [ 'cost' => floatval( $cost ) ] );
	}
}

new KFIR_Custom_Pricing_Agent();
