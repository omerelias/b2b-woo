<?php
/**
 * ממשק ניהול: בחירת לקוח, הוספת מוצרים/וריאציות והגדרת מחיר מותאם – UI נוח ומהיר.
 */
class KFIR_Custom_Pricing_Admin {
	public function __construct() {
		if ( is_admin() ) {
			add_action( 'admin_menu', [ $this, 'register_menu' ] );
			add_action( 'admin_enqueue_scripts', [ $this, 'enqueue_assets' ] );
			// AJAX
			add_action( 'wp_ajax_kfir_search_users', [ $this, 'ajax_search_users' ] );
			add_action( 'wp_ajax_kfir_search_products', [ $this, 'ajax_search_products' ] );
			add_action( 'wp_ajax_kfir_get_user_prices', [ $this, 'ajax_get_user_prices' ] );
			add_action( 'wp_ajax_kfir_save_user_prices', [ $this, 'ajax_save_user_prices' ] );
		}
        else{
            add_action('wp_enqueue_scripts', [ $this, 'enqueue_frontend_assets' ] );
        }
	}

	public function register_menu() {
		add_submenu_page(
			'edit.php?post_type=product',
			'תמחור לקוחות',
			'תמחור לקוחות',
			'manage_woocommerce',
			'kfir-customer-pricing',
			[ $this, 'render_page' ]
		);
	}

    public function enqueue_frontend_assets() {
        wp_enqueue_style( 'kfir-cp-frontend-css', get_stylesheet_directory_uri() . '/inc/lib/custom-pricing/assets/kfir-cp-frontend.css', [], '1.0' );
    }
	public function enqueue_assets( $hook ) {

		if ( $hook !== 'product_page_kfir-customer-pricing' ) return;
		wp_enqueue_script( 'selectWoo' );
		wp_enqueue_style( 'select2' );
		wp_enqueue_style( 'woocommerce_admin_styles' );

		wp_enqueue_script( 'kfir-cp-admin', get_stylesheet_directory_uri() . '/inc/lib/custom-pricing/assets/kfir-cp-admin.js', [ 'jquery', 'selectWoo' ], '1.2', true );
		wp_localize_script( 'kfir-cp-admin', 'KFIR_CP', [
			'ajax'   => admin_url( 'admin-ajax.php' ),
			'nonce'  => wp_create_nonce( 'kfir_cp_nonce' ),
		] );

		// Enqueue the CSS file
		wp_enqueue_style( 'kfir-cp-admin-css', get_stylesheet_directory_uri() . '/inc/lib/custom-pricing/assets/kfir-cp-admin.css', [], '1.3' );
	}



	public function render_page() {
		?>
		<div class="wrap kfir-wrap">
			<h1>
				<span class="kfir-icon">💰</span>
				תמחור לקוחות
			</h1>
			
			<div class="kfir-card">
				<div class="kfir-card-header">
					<h2>בחירת לקוח</h2>
					<p>בחר/י לקוח כדי לטעון או לערוך את המחירים המותאמים שלו</p>
				</div>
				<div class="kfir-row">
					<select id="kfir-user" class="kfir-select" data-placeholder="בחר/י לקוח…"></select>
					<button class="button kfir-tooltip" id="kfir-load-user" data-tooltip="טען את כל המחירים המותאמים ללקוח הנבחר">
						<span class="kfir-btn-icon">📥</span>
						טען מחירי לקוח
					</button>
				</div>
			</div>

			<div class="kfir-card">
				<div class="kfir-card-header">
					<h2>ניהול מוצרים ומחירים</h2>
					<p>הוסף מוצרים או וריאציות והגדר מחירים מותאמים ללקוח</p>
				</div>
				<div class="kfir-row">
					<select id="kfir-product" class="kfir-select" data-placeholder="חפש מוצר או SKU…"></select>
					<button class="button kfir-tooltip" id="kfir-add-product" data-tooltip="הוסף את המוצר הנבחר לרשימת המחירים">
						<span class="kfir-btn-icon">➕</span>
						הוסף לרשימה
					</button>
				</div>
				
				<div class="kfir-products">
					<div class="kfir-table-header">
						<h3>רשימת מוצרים ומחירים</h3>
						<span class="kfir-count" id="kfir-products-count">0 מוצרים</span>
					</div>
					
					<table class="kfir-table" id="kfir-table">
						<thead>
							<tr>
								<th style="width:40%">
									<span class="kfir-th-icon">📦</span>
									מוצר
								</th>
								<th style="width:20%">
									<span class="kfir-th-icon">🆔</span>
									ID
								</th>
								<th style="width:20%">
									<span class="kfir-th-icon">💰</span>
									מחיר לקוח
								</th>
								<th style="width:20%">
									<span class="kfir-th-icon">⚙️</span>
									פעולות
								</th>
							</tr>
						</thead>
						<tbody id="kfir-rows">
							<tr class="kfir-empty-state">
								<td colspan="4">
									<div class="kfir-empty-state">
										<p>לא נבחרו מוצרים עדיין</p>
										<p>בחר/י מוצר מהרשימה למעלה כדי להתחיל</p>
									</div>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
				
				<div class="kfir-actions">
					<button class="button kfir-secondary" id="kfir-clear-all" data-tooltip="נקה את כל המוצרים מהרשימה">
						<span class="kfir-btn-icon">🗑️</span>
						נקה הכל
					</button>
					<button class="button button-primary kfir-tooltip" id="kfir-save" data-tooltip="שמור את כל המחירים המותאמים ללקוח">
						<span class="kfir-btn-icon">💾</span>
						שמור מחירים
					</button>
				</div>
			</div>
			
			<div class="kfir-footer">
				<p>💡 <strong>טיפ:</strong> ניתן לחפש מוצרים לפי שם או מספר SKU</p>
			</div>
		</div>
		<?php
	}

	public function ajax_search_users() {
		check_ajax_referer( 'kfir_cp_nonce', 'nonce' );
		if ( ! current_user_can( 'manage_woocommerce' ) ) wp_send_json_error();
		$q = isset( $_GET['q'] ) ? sanitize_text_field( wp_unslash( $_GET['q'] ) ) : '';
		$args = [
			'number'  => 20,
			'search'  => '*' . $q . '*',
			'orderby' => 'display_name',
			'order'   => 'ASC',
			'fields'  => [ 'ID', 'display_name', 'user_email' ],
		];
		$users = get_users( $args );
		$out = [];
		foreach ( $users as $u ) {
			$out[] = [ 'id' => $u->ID, 'text' => sprintf( '%s (%s)', $u->display_name, $u->user_email ) ];
		}
		wp_send_json( [ 'results' => $out ] );
	}

	public function ajax_search_products() {
		check_ajax_referer( 'kfir_cp_nonce', 'nonce' );
		if ( ! current_user_can( 'manage_woocommerce' ) ) wp_send_json_error();
		$q = isset( $_GET['q'] ) ? sanitize_text_field( wp_unslash( $_GET['q'] ) ) : '';

		$results = [];
		$sku_query = new WP_Query([
			'post_type'      => [ 'product', 'product_variation' ],
			'posts_per_page' => 15,
			'suppress_filters' => true,
			'meta_query'     => [
				[
					'key'   => '_sku',
					'value' => $q,
					'compare' => 'LIKE',
				]
			],
		]);

		$ids = [];
		foreach ( $sku_query->posts as $p ) {
			$ids[] = $p->ID;
		}

		$title_query = new WP_Query([
			'post_type'      => [ 'product', 'product_variation' ],
			's'              => $q,
			'post__not_in'   => $ids,
			'posts_per_page' => 15,
			'suppress_filters' => true,
		]);

		$posts = array_merge( $sku_query->posts, $title_query->posts );

		foreach ( $posts as $p ) {
			$prod = wc_get_product( $p->ID );
			if ( ! $prod ) continue;
			if ( $prod->is_type( 'variation' ) ) {
				$parent = wc_get_product( $prod->get_parent_id() );
				$label  = $parent ? $parent->get_name() : __( 'Variation', 'woocommerce' );
				$attrs  = wc_get_formatted_variation( $prod, true );
				$text   = sprintf( '%s — %s', $label, $attrs );
			} else {
				$text = $prod->get_name();
			}
			$results[] = [
				'id'   => $prod->get_id(),
				'text' => $text . '  #' . $prod->get_id(),
			];
		}

		wp_send_json( [ 'results' => $results ] );
	}

	public function ajax_get_user_prices() {
		check_ajax_referer( 'kfir_cp_nonce', 'nonce' );
		if ( ! current_user_can( 'manage_woocommerce' ) ) wp_send_json_error();
		$user_id = isset( $_POST['user_id'] ) ? absint( $_POST['user_id'] ) : 0;
		if ( ! $user_id ) wp_send_json_error();
		$all = get_user_meta( $user_id );
		$rows = [];
		foreach ( $all as $key => $vals ) {
			if ( strpos( $key, 'custom_price_' ) !== 0 ) continue;
			$product_id = absint( substr( $key, strlen( 'custom_price_' ) ) );
			if ( ! $product_id ) continue;
			$price  = floatval( $vals[0] );
			$prod   = wc_get_product( $product_id );
			if ( ! $prod ) continue;
			$is_var = $prod->is_type( 'variation' );
			$label  = $is_var && $prod->get_parent_id() ? wc_get_product( $prod->get_parent_id() )->get_name() : $prod->get_name();
			$var    = $is_var ? wc_get_formatted_variation( $prod, true ) : '';
			$rows[] = [
				'id'    => $product_id,
				'name'  => $label,
				'attrs' => $var,
				'price' => wc_format_decimal( $price ),
			];
		}
		wp_send_json_success( [ 'rows' => $rows ] );
	}

	public function ajax_save_user_prices() {
		check_ajax_referer( 'kfir_cp_nonce', 'nonce' );
		if ( ! current_user_can( 'manage_woocommerce' ) ) wp_send_json_error();
		$user_id = isset( $_POST['user_id'] ) ? absint( $_POST['user_id'] ) : 0;
		$data    = isset( $_POST['rows'] ) ? (array) $_POST['rows'] : [];
		if ( ! $user_id ) wp_send_json_error( [ 'message' => 'user_id missing' ] );
		foreach ( $data as $row ) {
			$pid   = isset( $row['id'] ) ? absint( $row['id'] ) : 0;
			$price = isset( $row['price'] ) ? wc_format_decimal( $row['price'] ) : '';
			if ( ! $pid ) continue;
			if ( $price === '' ) {
				delete_user_meta( $user_id, 'custom_price_' . $pid );
			} else {
				update_user_meta( $user_id, 'custom_price_' . $pid, $price );
			}
		}
		wp_send_json_success( [ 'message' => 'saved' ] );
	}
}

new KFIR_Custom_Pricing_Admin();
