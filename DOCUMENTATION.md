# תיעוד מלא: מערכת Custom Pricing (KFIR Custom Pricing)

## 📋 סקירה כללית

**KFIR Custom Pricing** היא מערכת ניהול מחירים מותאמים ללקוחות ב-WooCommerce. המערכת מאפשרת להגדיר מחירים ייחודיים לכל לקוח, כולל תמיכה במוצרים ללא מחיר בסיסי.

**גרסה:** 1.0  
**מפתח:** Omer Elias  
**מיקום:** `inc/lib/custom-pricing/`

---

## 🏗️ מבנה הקבצים

```
inc/lib/custom-pricing/
├── class-kfir-custom-pricing.php        # הלוגיקה הראשית - טיפול במחירים בפרונט-אנד
├── class-kfir-custom-pricing-admin.php  # ממשק ניהול - תמחור לקוחות באדמין
├── assets/
│   ├── kfir-cp-admin.js                  # JavaScript לממשק הניהול
│   ├── kfir-cp-admin.css                # עיצוב לממשק הניהול
│   └── kfir-cp-frontend.css              # עיצוב לפרונט-אנד
├── README.md                             # תיעוד שיפורים ויזואליים
└── DOCUMENTATION.md                      # קובץ זה - תיעוד מלא
```

---

## 🔌 טעינת המערכת

המערכת נטענת ב-`functions.php`:

```php
require_once(get_stylesheet_directory() . '/inc/lib/custom-pricing/class-kfir-custom-pricing.php');
require_once(get_stylesheet_directory() . '/inc/lib/custom-pricing/class-kfir-custom-pricing-admin.php');
```

---

## 🎯 תכונות עיקריות

### 1. **מחירים מותאמים ללקוח**
- כל לקוח יכול לקבל מחירים שונים לכל מוצר
- המחירים נשמרים ב-user meta עם המפתח: `custom_price_{product_id}`
- תמיכה במוצרים רגילים ווריאציות

### 2. **מוצרים ללא מחיר בסיסי**
- תמיכה במוצרים עם מחיר 0 או ריק
- מוצרים כאלה יכולים להיות נרכשים רק למשתמשים מחוברים
- תצוגה: "מחיר ייקבע בהמשך" או "מחיר לא סופי"

### 3. **הגבלת גישה למשתמשים לא מחוברים**
- הסרת כפתור "הוסף לעגלה" למשתמשים לא מחוברים
- תצוגה: "התחבר כדי להזמין"

### 4. **ממשק ניהול באדמין**
- דף ניהול תחת: **WooCommerce → תמחור לקוחות**
- חיפוש לקוחות לפי שם או אימייל
- חיפוש מוצרים לפי שם או SKU
- הגדרת מחירים מותאמים לכל לקוח

### 5. **עדכון מחירים אוטומטי מהזמנות**
- כשמשנים מחיר בהזמנה, המערכת מעדכנת את המחיר המותאם ללקוח
- חישוב מחיר יחידה: `total / quantity`

### 6. **ניהול סטטוס הזמנות**
- כל הזמנה חדשה עוברת אוטומטית למצב "on-hold"
- מניעת השלמה אוטומטית של הזמנות

---

## 🔧 פונקציות ומתודות

### `KFIR_Custom_Pricing` (הקלאס הראשי)

#### Hooks ו-Filters

| Hook/Filter | מתודה | תיאור |
|------------|--------|-------|
| `woocommerce_get_price_html` | `custom_price_html()` | שינוי תצוגת המחיר בפרונט-אנד |
| `woocommerce_is_purchasable` | `allow_zero_price_products()` | אפשרות רכישה למוצרים ללא מחיר |
| `woocommerce_variation_is_purchasable` | `allow_zero_price_variations()` | אפשרות רכישה לוריאציות ללא מחיר |
| `woocommerce_before_calculate_totals` | `apply_custom_price_to_cart()` | החלת מחיר מותאם על עגלת הקניות |
| `woocommerce_cart_item_price` | `custom_cart_item_price_display()` | תצוגת מחיר מותאם בעגלה |
| `woocommerce_cart_item_subtotal` | `custom_cart_item_price_display()` | תצוגת סיכום מותאם בעגלה |
| `woocommerce_cart_totals_order_total_html` | `maybe_hide_order_total()` | הסתרת סה"כ אם יש מחירים חסרים |
| `woocommerce_order_amount_total` | `maybe_force_order_total_zero()` | איפוס סה"כ אם יש מחירים חסרים |
| `woocommerce_update_order` | `oc_update_custom_prices_on_order_save()` | עדכון מחירים מותאמים מהזמנה |
| `woocommerce_checkout_order_processed` | `oc_set_order_on_hold_for_specific_shipping()` | העברת הזמנה למצב on-hold |
| `init` | `oc_remove_add_to_cart_for_guests()` | הסרת כפתור הוספה לעגלה למשתמשים לא מחוברים |
| `wp_ajax_get_custom_variation_price` | `ajax_get_custom_variation_price()` | AJAX לקבלת מחיר מותאם לוריאציה |

#### מתודות ציבוריות

**`get_customer_price( $user_id, $product_id )`**
- מחזיר את המחיר המותאם ללקוח למוצר מסוים
- מחזיר `null` אם אין מחיר מותאם
- מחזיר `float` אם יש מחיר

**`set_customer_price( $user_id, $product_id, $price )`**
- שומר מחיר מותאם ללקוח למוצר מסוים
- משתמש ב-`update_user_meta()` עם המפתח `custom_price_{product_id}`

**`custom_price_html( $price_html, $product )`**
- מטפל בתצוגת המחיר בפרונט-אנד
- למשתמשים לא מחוברים: מציג "התחבר כדי להזמין"
- למשתמשים מחוברים: מציג מחיר מותאם או "מחיר ייקבע בהמשך"

**`apply_custom_price_to_cart( $cart )`**
- מחיל מחירים מותאמים על כל המוצרים בעגלה
- רץ לפני חישוב סה"כ העגלה

**`custom_cart_item_price_display( $price, $cart_item, $cart_item_key )`**
- משנה את תצוגת המחיר בעגלה
- מציג "מחיר לא סופי" אם אין מחיר מותאם והמחיר הבסיסי הוא 0

**`maybe_hide_order_total( $html )`**
- מסתיר את סה"כ ההזמנה אם יש מחירים חסרים
- מציג: "סה״כ: מחיר לא סופי"

**`maybe_force_order_total_zero( $total, $order )`**
- מאפס את סה"כ ההזמנה אם יש מחירים חסרים

**`oc_update_custom_prices_on_order_save( $order_id )`**
- מעדכן מחירים מותאמים מהזמנה
- מחשב מחיר יחידה: `total / quantity`
- מעדכן רק אם המחיר השתנה

**`oc_set_order_on_hold_for_specific_shipping( $order_id, $posted_data, $order )`**
- מעביר הזמנה למצב "on-hold" לאחר תהליך התשלום

**`ajax_get_custom_variation_price()`**
- AJAX endpoint לקבלת מחיר מותאם לוריאציה
- מחזיר JSON עם המחיר, המחיר המפורמט, וסטטוס האם יש מחיר מותאם

#### מתודות מוגנות

**`cart_has_missing_prices()`**
- בודק אם יש בעגלה מוצרים ללא מחיר
- מחזיר `true` אם יש מוצר עם מחיר 0/ריק ואין מחיר מותאם

**`order_has_missing_prices( $order )`**
- בודק אם יש בהזמנה מוצרים ללא מחיר
- מחזיר `true` אם יש פריט עם total <= 0

---

### `KFIR_Custom_Pricing_Admin` (ממשק הניהול)

#### Hooks

| Hook | מתודה | תיאור |
|------|--------|-------|
| `admin_menu` | `register_menu()` | הוספת תפריט באדמין |
| `admin_enqueue_scripts` | `enqueue_assets()` | טעינת CSS/JS באדמין |
| `wp_enqueue_scripts` | `enqueue_frontend_assets()` | טעינת CSS בפרונט-אנד |
| `wp_ajax_kfir_search_users` | `ajax_search_users()` | AJAX לחיפוש לקוחות |
| `wp_ajax_kfir_search_products` | `ajax_search_products()` | AJAX לחיפוש מוצרים |
| `wp_ajax_kfir_get_user_prices` | `ajax_get_user_prices()` | AJAX לטעינת מחירי לקוח |
| `wp_ajax_kfir_save_user_prices` | `ajax_save_user_prices()` | AJAX לשמירת מחירי לקוח |

#### מתודות

**`register_menu()`**
- יוצר דף תחת: **WooCommerce → תמחור לקוחות**
- דורש הרשאה: `manage_woocommerce`
- Slug: `kfir-customer-pricing`

**`render_page()`**
- מציג את ממשק הניהול
- כולל:
  - בחירת לקוח (Select2)
  - חיפוש והוספת מוצרים
  - טבלת מוצרים ומחירים
  - כפתורי שמירה וניקוי

**`ajax_search_users()`**
- מחפש לקוחות לפי שם או אימייל
- מחזיר עד 20 תוצאות
- פורמט: `{id, text: "שם (email)"}`

**`ajax_search_products()`**
- מחפש מוצרים לפי שם או SKU
- תומך במוצרים רגילים ווריאציות
- מחזיר עד 15 תוצאות מכל סוג
- פורמט: `{id, text: "שם מוצר #ID"}`

**`ajax_get_user_prices()`**
- טוען את כל המחירים המותאמים ללקוח
- מחזיר רשימה של מוצרים עם מחירים
- פורמט: `{id, name, attrs, price}`

**`ajax_save_user_prices()`**
- שומר מחירים מותאמים ללקוח
- מקבל מערך של `{id, price}`
- אם `price` ריק, מוחק את המחיר המותאם

---

## 💾 מבנה הנתונים

### User Meta

המחירים המותאמים נשמרים ב-user meta עם המפתח:
```
custom_price_{product_id}
```

**דוגמה:**
- לקוח ID: 123
- מוצר ID: 456
- מפתח: `custom_price_456`
- ערך: `99.50` (מספר עשרוני)

### פורמט הנתונים

**שמירה:**
```php
update_user_meta( $user_id, 'custom_price_' . $product_id, $price );
```

**קריאה:**
```php
$price = get_user_meta( $user_id, 'custom_price_' . $product_id, true );
```

---

## 🎨 עיצוב ו-CSS

### קבצי CSS

1. **`kfir-cp-admin.css`** - עיצוב לממשק הניהול
   - גרדיאנטים כחול-סגול
   - כרטיסים מודרניים עם צללים
   - אנימציות חלקות
   - תמיכה ב-Dark Mode
   - Responsive Design

2. **`kfir-cp-frontend.css`** - עיצוב לפרונט-אנד
   - הסתרת minicart למשתמשים לא מחוברים
   - הסתרת פילטר מחירים למשתמשים לא מחוברים
   - עיצוב לטקסט "מחיר ייקבע בהמשך"

### Classes CSS

- `.no-price` - מחיר לא זמין
- `.login-panel` - קישור להתחברות
- `.kfir-wrap` - עטיפה לממשק הניהול
- `.kfir-card` - כרטיס בממשק הניהול
- `.kfir-table` - טבלת מוצרים

---

## 🔐 אבטחה

### Nonce Verification
כל בקשות AJAX נבדקות עם nonce:
```php
check_ajax_referer( 'kfir_cp_nonce', 'nonce' );
```

### Capability Check
כל פעולות הניהול דורשות הרשאה:
```php
if ( ! current_user_can( 'manage_woocommerce' ) ) wp_send_json_error();
```

### Sanitization
כל הקלטים מנוקים:
- `sanitize_text_field()` - טקסט
- `absint()` - מספרים שלמים
- `wc_format_decimal()` - מחירים

---

## 🚀 תכונות מתקדמות

### 1. **עדכון מחירים מהזמנות**
כשמנהל משנה מחיר בהזמנה, המערכת:
- מחשבת מחיר יחידה: `total / quantity`
- מעדכנת את המחיר המותאם ללקוח
- מעדכנת רק אם המחיר השתנה

### 2. **ניהול הזמנות עם מחירים חסרים**
- סה"כ ההזמנה מוצג כ-0 אם יש מחירים חסרים
- תצוגה: "מחיר לא סופי"
- הזמנות עוברות למצב "on-hold" אוטומטית

### 3. **תמיכה בוריאציות**
- כל וריאציה יכולה לקבל מחיר מותאם נפרד
- AJAX endpoint לקבלת מחיר לוריאציה
- תצוגה נכונה של שם המוצר והאטריבוטים

### 4. **חיפוש מתקדם**
- חיפוש מוצרים לפי שם או SKU
- חיפוש לקוחות לפי שם או אימייל
- תוצאות מוגבלות (15-20) לביצועים

---

## 📱 תמיכה במכשירים

- **Responsive Design** - עובד על כל המסכים
- **Dark Mode** - תמיכה בעדפות מערכת
- **High Contrast** - נגישות
- **Reduced Motion** - כיבוי אנימציות לפי העדפה

---

## 🔄 זרימת עבודה

### הגדרת מחיר מותאם ללקוח:
1. מנהל נכנס ל-**WooCommerce → תמחור לקוחות**
2. בוחר לקוח מהרשימה
3. לוחץ "טען מחירי לקוח"
4. מוסיף מוצרים מהרשימה
5. מגדיר מחירים
6. לוחץ "שמור מחירים"

### רכישה בפרונט-אנד:
1. לקוח מחובר רואה מחיר מותאם (אם הוגדר)
2. אם אין מחיר מותאם והמחיר הבסיסי הוא 0, רואה "מחיר ייקבע בהמשך"
3. יכול להוסיף לעגלה גם מוצרים ללא מחיר
4. בעגלה רואה מחיר מותאם או "מחיר לא סופי"
5. אם יש מחירים חסרים, סה"כ מוצג כ-"מחיר לא סופי"
6. לאחר תשלום, ההזמנה עוברת למצב "on-hold"

### עדכון מחיר מהזמנה:
1. מנהל פותח הזמנה
2. משנה מחיר של פריט
3. שומר את ההזמנה
4. המערכת מחשבת מחיר יחידה ומעדכנת את המחיר המותאם ללקוח

---

## ⚠️ מגבלות וידוע

1. **משתמשים לא מחוברים** - לא יכולים לראות מחירים או להוסיף לעגלה
2. **מחירים חסרים** - סה"כ ההזמנה יהיה 0
3. **הזמנות אוטומטיות** - כל הזמנה עוברת ל-"on-hold"
4. **תמיכה בוריאציות** - כל וריאציה צריכה מחיר נפרד

---

## 🛠️ תחזוקה ופיתוח

### הוספת תכונה חדשה:
1. הוסף hook/filter ב-`class-kfir-custom-pricing.php`
2. אם צריך ממשק ניהול, הוסף ל-`class-kfir-custom-pricing-admin.php`
3. עדכן את התיעוד

### Debug:
- בדוק user meta: `get_user_meta( $user_id, 'custom_price_*' )`
- בדוק hooks: `add_action( 'woocommerce_get_price_html', function() { error_log('test'); } );`
- בדוק AJAX: Network tab בדפדפן

---

## 📚 משאבים נוספים

- **README.md** - תיעוד שיפורים ויזואליים
- **WooCommerce Hooks** - [תיעוד רשמי](https://woocommerce.github.io/code-reference/hooks/hooks.html)
- **WordPress User Meta** - [תיעוד רשמי](https://developer.wordpress.org/reference/functions/get_user_meta/)

---

**נעשה עם ❤️ עבור מערכת התמחור המותאם של KFIR**
