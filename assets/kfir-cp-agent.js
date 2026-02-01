(function($) {
    'use strict';

    const KfirAgent = {
        currentScreen: 'dashboard',
        selectedCustomer: null,
        orderItems: [],
        currentOrderId: null,

        // שמירה וטעינה מ-sessionStorage
        saveState: function() {
            try {
                const state = {
                    currentScreen: this.currentScreen,
                    selectedCustomer: this.selectedCustomer,
                    orderItems: this.orderItems
                };
                sessionStorage.setItem('kfir_agent_order_state', JSON.stringify(state));
            } catch (e) {
                console.warn('Failed to save order state:', e);
            }
        },

        loadState: function() {
            try {
                const saved = sessionStorage.getItem('kfir_agent_order_state');
                if (saved) {
                    const state = JSON.parse(saved);
                    if (state.selectedCustomer) {
                        this.selectedCustomer = state.selectedCustomer;
                    }
                    if (state.orderItems && Array.isArray(state.orderItems)) {
                        this.orderItems = state.orderItems;
                    }
                    if (state.currentScreen) {
                        return state.currentScreen;
                    }
                }
            } catch (e) {
                console.warn('Failed to load order state:', e);
            }
            return null;
        },

        clearState: function() {
            try {
                sessionStorage.removeItem('kfir_agent_order_state');
            } catch (e) {
                console.warn('Failed to clear order state:', e);
            }
        },

        resetOrder: function() {
            // ניקוי כל הסטייט
            this.orderItems = [];
            this.selectedCustomer = null;
            this.currentOrderId = null;
            this.clearState();
            
            // ניקוי ה-DOM
            $('#all-products-list').empty();
            $('#purchased-products-list').empty();
            $('#category-products-list').empty();
            $('#checkout-items').empty();
            $('#selected-customer-name').text('-');
            $('#checkout-customer-name').text('-');
            $('#success-customer-name').text('-');
            $('#order-total').text('0.00');
            $('#checkout-total').text('0.00');
            
            // איפוס כמות כל המוצרים
            $('.product-item .product-quantity').val(0);
            
            // חזרה לטאב קטגוריות
            $('.kfir-tab-btn[data-tab="categories"]').addClass('active');
            $('.kfir-tab-btn').not('[data-tab="categories"]').removeClass('active');
            $('#categories-panel').show();
            $('#search-panel').hide();
            $('#purchased-panel').hide();
            $('#category-products-wrap').hide();
        },

        init: function() {
            this.bindEvents();
            
            // הסתרת אייקונים בטאבים במובייל
            this.hideTabIconsOnMobile();
            $(window).on('resize', () => {
                this.hideTabIconsOnMobile();
            });
            
            // טיפול בכפתור "הקודם" של הדפדפן
            window.addEventListener('popstate', (e) => {
                if (e.state && e.state.screen) {
                    this.showScreenWithoutHistory(e.state.screen);
                } else {
                    // אם אין state, נבדוק את ה-URL
                    const urlParams = new URLSearchParams(window.location.search);
                    const screenParam = urlParams.get('screen');
                    if (screenParam) {
                        this.showScreenWithoutHistory(screenParam);
                    } else {
                        // אם אין state ואין screen ב-URL, נחזור לדאשבורד
                        this.showScreenWithoutHistory('dashboard');
                    }
                }
            });
            
            // בדיקה אם יש screen ב-URL (למשל כשמגיעים עם קישור ישיר)
            const urlParams = new URLSearchParams(window.location.search);
            const screenParam = urlParams.get('screen');
            
            // אם המשתמש לא מחובר, נציג את מסך ההתחברות
            if (!kfirAgentData.is_logged_in) {
                this.showScreen('login', true); // skipHistory כי זה טעינה ראשונית
            } else {
                // טעינת מצב שמור
                const savedScreen = this.loadState();
                
                // אם יש screen ב-URL, נציג אותו (בלי history כי זה טעינה ראשונית)
                let screenToShow = screenParam && $('#screen-' + screenParam).length ? screenParam : 'dashboard';
                
                // אם יש מצב שמור עם מסך הזמנה, נשתמש בו
                if (savedScreen && (savedScreen === 'new-order' || savedScreen === 'checkout')) {
                    screenToShow = savedScreen;
                }
                
                this.showScreen(screenToShow, true);
                
                // אם יש מצב שמור, נשחזר את הנתונים
                if (this.selectedCustomer) {
                    this.restoreOrderState();
                }
                
                // אם המסך הוא new-order, נפתח את טאב קטגוריות ונטען אותן
                if (screenToShow === 'new-order') {
                    // פתיחת טאב קטגוריות
                    $('.kfir-tab-btn[data-tab="categories"]').addClass('active');
                    $('.kfir-tab-btn').not('[data-tab="categories"]').removeClass('active');
                    $('#categories-panel').show();
                    $('#search-panel').hide();
                    $('#purchased-panel').hide();
                    // טעינת קטגוריות
                    this.loadCategories(0);
                }
            }
        },
        
        hideTabIconsOnMobile: function() {
            if (window.innerWidth <= 768) {
                // הסתרת אייקונים במובייל
                $('.kfir-product-browse-tabs .kfir-tab-btn').each(function() {
                    const $btn = $(this);
                    const text = $btn.text();
                    // הסרת האייקון הראשון (אמוג'י) מהטקסט
                    const textWithoutIcon = text.replace(/^[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u, '').trim();
                    if (textWithoutIcon !== text) {
                        $btn.data('original-text', text);
                        $btn.text(textWithoutIcon);
                    }
                });
            } else {
                // שחזור האייקונים בדסקטופ
                $('.kfir-product-browse-tabs .kfir-tab-btn').each(function() {
                    const $btn = $(this);
                    const originalText = $btn.data('original-text');
                    if (originalText) {
                        $btn.text(originalText);
                        $btn.removeData('original-text');
                    }
                });
            }
        },

        bindEvents: function() {
            // כפתורי ניווט
            $(document).on('click', '[data-screen]', this.handleScreenChange.bind(this));
            
            // חיפוש לקוחות
            $(document).on('input', '#customer-search', this.debounce(this.searchCustomers.bind(this), 300));
            
            // טופס לקוח חדש
            $(document).on('submit', '#new-customer-form', this.handleNewCustomer.bind(this));
            
            // בחירת לקוח
            $(document).on('click', '.customer-result', this.selectCustomer.bind(this));
            
            // חיפוש מוצרים
            this.initProductSearch();
            
            // כפתורי פלוס/מינוס לכמות
            $(document).on('click', '.quantity-minus', function(e) {
                e.preventDefault();
                const $item = $(e.target).closest('.product-item');
                const $quantityInput = $item.find('.product-quantity');
                let quantity = parseInt($quantityInput.val()) || 0;
                
                if (quantity > 1) {
                    quantity--;
                    $quantityInput.val(quantity);
                    $quantityInput.trigger('change');
                } else if (quantity === 1) {
                    // אם הכמות היא 1, הפחת ל-0 והסר מהרשימה
                    quantity = 0;
                    $quantityInput.val(0);
                    const productId = parseInt($item.data('product-id'));
                    this.orderItems = this.orderItems.filter(item => item.id != productId);
                    this.updateOrderSummary();
                    this.saveState();
                }
            }.bind(this));
            
            $(document).on('click', '.quantity-plus', function(e) {
                e.preventDefault();
                const $item = $(e.target).closest('.product-item');
                const $quantityInput = $item.find('.product-quantity');
                let quantity = parseInt($quantityInput.val()) || 0;
                quantity++;
                $quantityInput.val(quantity);
                $quantityInput.trigger('change');
            }.bind(this));
            
            // עריכת כמות - גם עדכון orderItems
            $(document).on('change', '.product-quantity', function(e) {
                const $item = $(e.target).closest('.product-item');
                const productId = parseInt($item.data('product-id'));
                const quantity = parseInt($(e.target).val()) || 0;
                const productName = $item.find('strong').text() || 'מוצר ללא שם';
                
                // חילוץ מחיר
                let price = 0;
                const $customPrice = $item.find('.custom-price');
                if ($customPrice.length && $customPrice.text().includes('מחיר ללקוח')) {
                    const priceText = $customPrice.text().replace(/[^\d.]/g, '');
                    price = priceText ? parseFloat(priceText) : 0;
                } else {
                    const $productPrice = $item.find('.product-price');
                    if ($productPrice.length) {
                        const priceText = $productPrice.text().replace(/[^\d.]/g, '');
                        price = priceText ? parseFloat(priceText) : 0;
                    } else {
                        const priceText = $customPrice.text().replace(/[^\d.]/g, '');
                        price = priceText ? parseFloat(priceText) : 0;
                    }
                }
                
                if (productId && !isNaN(productId)) {
                    // חילוץ תמונות מה-DOM
                    const $productImg = $item.find('.product-image img');
                    const imageUrl = $productImg.attr('src') || '';
                    const imageUrlFull = $productImg.data('full-image') || '';
                    
                    const existingItem = this.orderItems.find(item => item.id == productId);
                    if (quantity >= 1) {
                        if (existingItem) {
                            existingItem.quantity = quantity;
                            existingItem.price = price;
                            existingItem.name = productName;
                            // עדכון תמונות רק אם אין כבר
                            if (!existingItem.image_url) existingItem.image_url = imageUrl;
                            if (!existingItem.image_url_full) existingItem.image_url_full = imageUrlFull;
                        } else {
                            // הוספה אם הכמות >= 1
                            this.orderItems.push({
                                id: productId,
                                name: productName,
                                price: price,
                                quantity: quantity,
                                image_url: imageUrl,
                                image_url_full: imageUrlFull
                            });
                        }
                    } else {
                        // אם הכמות היא 0, הסר מהרשימה
                        if (existingItem) {
                            this.orderItems = this.orderItems.filter(item => item.id != productId);
                        }
                    }
                }
                
                this.updateOrderSummary();
                this.saveState();
            }.bind(this));
            
            // המשך לתשלום
            $(document).on('click', '.proceed-checkout', this.proceedToCheckout.bind(this));
            
            // טאבים: קטגוריות / חיפוש מוצרים / מוצרים שנרכשו בעבר
            $(document).on('click', '.kfir-tab-btn', this.handleProductBrowseTab.bind(this));
            $(document).on('click', '.kfir-category-item', this.handleCategoryClick.bind(this));
            
            // עריכת מחיר וכמות במסך סיכום
            $(document).on('change', '.edit-price, .edit-quantity', function(e) {
                console.log('🔵 [DEBUG] Event triggered on:', e.target.className, 'Value:', $(e.target).val());
                console.log('🔵 [DEBUG] Event target:', e.target);
                console.log('🔵 [DEBUG] Current screen:', this.currentScreen);
                console.log('🔵 [DEBUG] Calling updateCheckoutTotal...');
                this.updateCheckoutTotal();
                console.log('🔵 [DEBUG] updateCheckoutTotal called');
            }.bind(this));
            
            // שיטת משלוח - הצגת שדה דמי משלוח ועדכון מחיר אוטומטי
            $(document).on('change', 'input[name="shipping_method"]', function() {
                const $selectedMethod = $(this);
                const $shippingCostInput = $('.shipping-cost-input');
                const $shippingCostField = $('#shipping-cost');
                
                if ($selectedMethod.is(':checked')) {
                    $shippingCostInput.slideDown(300);
                    
                    // קבלת מחיר מהנתונים שנשמרו ב-data attribute
                    let shippingCost = parseFloat($selectedMethod.attr('data-shipping-cost')) || 0;
                    
                    // אם אין מחיר ב-data attribute, ננסה לקבל מ-AJAX
                    if ((shippingCost === 0 || isNaN(shippingCost)) && $selectedMethod.val()) {
                        $.ajax({
                            url: kfirAgentData.ajaxurl,
                            type: 'GET',
                            data: {
                                action: 'kfir_agent_get_shipping_cost',
                                nonce: kfirAgentData.nonce,
                                method_id: $selectedMethod.val()
                            },
                            success: (response) => {
                                if (response.success) {
                                    shippingCost = parseFloat(response.data.cost) || 0;
                                    $shippingCostField.val(shippingCost.toFixed(2));
                                    KfirAgent.updateCheckoutTotal();
                                }
                            }
                        });
                    } else {
                        // עדכון המחיר ישירות מהנתונים
                        $shippingCostField.val(shippingCost.toFixed(2));
                        KfirAgent.updateCheckoutTotal();
                    }
                } else {
                    // אם אין שיטת משלוח נבחרת, נסתיר את השדה
                    if ($('input[name="shipping_method"]:checked').length === 0) {
                        $shippingCostInput.slideUp(300);
                        $shippingCostField.val(0);
                        KfirAgent.updateCheckoutTotal();
                    }
                }
            });
            
            // עדכון סה"כ כשמשנים דמי משלוח
            $(document).on('change', '#shipping-cost', this.updateCheckoutTotal.bind(this));
            
            // מחיקת פריט
            $(document).on('click', '.remove-item', this.removeItem.bind(this));
            
            // Lightbox לתמונות מוצרים
            $(document).on('click', '.product-image img.kfir-product-image-clickable', this.openImageLightbox.bind(this));
            $(document).on('click', '.checkout-product-name', this.openProductImageLightbox.bind(this));
            $(document).on('click', '.kfir-lightbox-overlay, .kfir-lightbox-close', this.closeImageLightbox.bind(this));
            $(document).on('keydown', (e) => {
                if (e.key === 'Escape' && $('.kfir-lightbox-overlay').is(':visible')) {
                    this.closeImageLightbox(e);
                }
            });
            
            // סיום הזמנה
            $(document).on('click', '.finalize-order', this.finalizeOrder.bind(this));
            
            // יצירת מסמכי iCount
            $(document).on('click', '.icount-create-btn', this.createIcountDocument.bind(this));
        },

        showScreen: function(screenName, skipHistory) {
            $('.kfir-screen').hide();
            $('#screen-' + screenName).show();
            this.currentScreen = screenName;
            // גלילה למעלה במובייל/טאבלט
            this.scrollToTop();
            
            // הוספה ל-history (אלא אם skipHistory = true)
            if (!skipHistory && screenName !== 'login') {
                const url = window.location.pathname + '?screen=' + screenName;
                window.history.pushState({ screen: screenName }, '', url);
            }
        },

        showScreenWithoutHistory: function(screenName) {
            // שינוי מסך ללא הוספה ל-history (לשימוש ב-popstate)
            this.showScreen(screenName, true);
        },

        scrollToTop: function() {
            // בדיקה אם זה מובייל או טאבלט
            if (window.innerWidth <= 1024) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        },

        handleScreenChange: function(e) {
            e.preventDefault();
            const screenName = $(e.currentTarget).data('screen');
            
            // אם מבטלים הזמנה (חוזרים לדאשבורד), נציג התראה לפני ביטול
            if (screenName === 'dashboard' && (this.currentScreen === 'new-order' || this.currentScreen === 'checkout')) {
                if (!confirm('האם אתה בטוח שברצונך לבטל את ההזמנה? כל הנתונים יימחקו.')) {
                    return; // המשתמש ביטל את הפעולה
                }
                this.resetOrder();
            }
            
            // אם עוברים למסך הזמנה חדשה, צריך לבחור לקוח (רק אם אין לקוח נבחר)
            if (screenName === 'new-order') {
                if (!this.selectedCustomer) {
                    this.showScreen('find-customer');
                    return;
                }
            }
            
            this.showScreen(screenName);
            this.saveState();
        },

        searchCustomers: function(e) {
            const searchTerm = $(e.target).val();
            if (searchTerm.length < 2) {
                $('#customer-results').empty();
                return;
            }

            this.showLoader('#customer-results');

            $.ajax({
                url: kfirAgentData.ajaxurl,
                type: 'GET',
                data: {
                    action: 'kfir_agent_search_customers',
                    nonce: kfirAgentData.nonce,
                    q: searchTerm
                },
                success: (response) => {
                    this.hideLoader();
                    if (response.success || response.results) {
                        this.displayCustomerResults(response.results || []);
                    } else {
                        this.showNotification('שגיאה בחיפוש לקוחות', 'error');
                    }
                },
                error: () => {
                    this.hideLoader();
                    this.showNotification('שגיאה בחיפוש לקוחות', 'error');
                }
            });
        },

        displayCustomerResults: function(results) {
            const $container = $('#customer-results');
            $container.empty();

            if (results.length === 0) {
                $container.html('<div class="kfir-empty-state">לא נמצאו תוצאות</div>');
                return;
            }

            results.forEach((customer) => {
                const displayParts = [];
                
                // שם עסק
                if (customer.business_name) {
                    displayParts.push(`<strong>${customer.business_name}</strong>`);
                }
                
                // שם לקוח
                if (customer.name) {
                    displayParts.push(customer.name);
                }
                
                // טלפון
                if (customer.phone) {
                    displayParts.push(`📞 ${customer.phone}`);
                }
                
                // ח.פ / ע.מ
                if (customer.vat_id) {
                    displayParts.push(`ח.פ: ${customer.vat_id}`);
                }
                
                // אימייל
                if (customer.email) {
                    displayParts.push(`✉️ ${customer.email}`);
                }
                
                // קביעת שם תצוגה - שם עסק או שם לקוח
                const displayName = customer.business_name || customer.name || 'לקוח #' + customer.id;
                
                const $result = $(`
                    <div class="customer-result" 
                         data-customer-id="${customer.id}" 
                         data-customer-name="${displayName.replace(/"/g, '&quot;')}" 
                         data-customer-business="${(customer.business_name || '').replace(/"/g, '&quot;')}" 
                         data-customer-fullname="${(customer.name || '').replace(/"/g, '&quot;')}">
                        <div class="customer-result-main">
                            ${displayParts.join(' | ')}
                        </div>
                    </div>
                `);
                $container.append($result);
            });
        },

        selectCustomer: function(e) {
            const $result = $(e.currentTarget);
            const customerId = $result.data('customer-id');
            
            // קבלת שם מהנתונים שנשמרו ב-data attribute
            let customerName = $result.data('customer-name');
            if (!customerName || customerName.trim() === '') {
                // אם אין שם ב-data attribute, ננסה לקבל מהתצוגה
                customerName = $result.data('customer-business') || $result.data('customer-fullname');
                if (!customerName || customerName.trim() === '') {
                    // אם עדיין אין שם, ננסה מהטקסט
                    customerName = $result.find('strong').text();
                    if (!customerName || customerName.trim() === '') {
                        // אם עדיין אין שם, ננסה מהטקסט הכללי
                        const customerText = $result.find('.customer-result-main').text();
                        const parts = customerText.split('|');
                        if (parts.length > 0) {
                            customerName = parts[0].trim();
                        }
                        if (!customerName || customerName.trim() === '') {
                            customerName = 'לקוח #' + customerId;
                        }
                    }
                }
            }
            
            this.selectedCustomer = {
                id: customerId,
                name: customerName
            };

            $('#selected-customer-name').text(customerName);
            $('#checkout-customer-name').text(customerName);
            $('#success-customer-name').text(customerName);

            // טעינת מוצרים שנרכשו בעבר
            this.loadPurchasedProducts(customerId);

            // מעבר למסך יצירת הזמנה (ברירת מחדל: טאב קטגוריות)
            this.showScreen('new-order');
            this.loadCategories(0); // טעינת קטגוריות ראשיות
            
            // שמירת מצב
            this.saveState();
        },

        restoreOrderState: function() {
            // שחזור שם הלקוח
            if (this.selectedCustomer && this.selectedCustomer.name) {
                $('#selected-customer-name').text(this.selectedCustomer.name);
                $('#checkout-customer-name').text(this.selectedCustomer.name);
                $('#success-customer-name').text(this.selectedCustomer.name);
            }
            
            // אם אנחנו במסך new-order, נפתח את טאב קטגוריות ונטען אותן
            if (this.currentScreen === 'new-order') {
                $('.kfir-tab-btn[data-tab="categories"]').addClass('active');
                $('.kfir-tab-btn').not('[data-tab="categories"]').removeClass('active');
                $('#categories-panel').show();
                $('#search-panel').hide();
                $('#purchased-panel').hide();
                this.loadCategories(0);
            }
            
            // שחזור מוצרים
            if (this.orderItems && this.orderItems.length > 0) {
                this.restoreOrderItems();
            }
        },

        restoreOrderItems: function() {
            // ניקוי רשימת המוצרים הנוכחית
            $('#all-products-list').empty();
            $('#purchased-products-list').empty();
            
            // שחזור כל מוצר
            const promises = this.orderItems.map((item) => {
                return new Promise((resolve) => {
                    $.ajax({
                        url: kfirAgentData.ajaxurl,
                        type: 'GET',
                        data: {
                            action: 'kfir_agent_get_product_details',
                            nonce: kfirAgentData.nonce,
                            product_id: item.id,
                            customer_id: this.selectedCustomer ? this.selectedCustomer.id : 0
                        },
                        success: (response) => {
                            if (response.success && response.data) {
                                const product = response.data;
                                const $item = this.createProductItem({
                                    id: product.id,
                                    name: product.name || item.name,
                                    sku: product.sku,
                                    price: product.price,
                                    custom_price: product.custom_price,
                                    image_url: product.image_url || '',
                                    image_url_full: product.image_url_full || ''
                                }, false);
                                
                                // הגדרת כמות
                                $item.find('.product-quantity').val(item.quantity || 0);
                                
                                $('#all-products-list').append($item);
                            }
                            resolve();
                        },
                        error: () => {
                            resolve();
                        }
                    });
                });
            });
            
            // אחרי שכל המוצרים נטענו, נעדכן את הסיכום
            Promise.all(promises).then(() => {
                this.updateOrderSummary();
            });
        },

        loadPurchasedProducts: function(customerId) {
            const $container = $('#purchased-products-list');
            this.showLoader('#purchased-products-list');

            $.ajax({
                url: kfirAgentData.ajaxurl,
                type: 'POST',
                data: {
                    action: 'kfir_agent_get_customer_orders',
                    nonce: kfirAgentData.nonce,
                    customer_id: customerId
                },
                success: (response) => {
                    this.hideLoader();
                    if (response.success && response.data.products.length > 0) {
                        this.displayPurchasedProducts(response.data.products);
                    } else {
                        $container.html('<div class="kfir-empty-state">לא נמצאו מוצרים שנרכשו בעבר</div>');
                    }
                },
                error: () => {
                    this.hideLoader();
                    $container.html('<div class="kfir-empty-state">שגיאה בטעינת מוצרים שנרכשו בעבר</div>');
                }
            });
        },

        displayPurchasedProducts: function(products) {
            const $container = $('#purchased-products-list');
            $container.empty();

            products.forEach((product) => {
                // חישוב המחיר הסופי
                const basePrice = parseFloat(product.price || 0);
                const customPrice = product.custom_price !== null && product.custom_price !== undefined 
                    ? parseFloat(product.custom_price) : null;
                const finalPrice = customPrice !== null ? customPrice : basePrice;
                
                // הוספה/עדכון ב-orderItems
                const existingItem = this.orderItems.find(item => item.id == product.id);
                if (!existingItem) {
                    this.orderItems.push({
                        id: parseInt(product.id),
                        name: product.name || 'מוצר ללא שם',
                        price: finalPrice, // מחיר סופי לשימוש
                        basePrice: basePrice, // מחיר בסיסי לתצוגה
                        customPrice: customPrice, // מחיר מותאם לתצוגה
                        quantity: 1
                    });
                } else {
                    // עדכון המחיר אם המוצר כבר קיים
                    existingItem.price = finalPrice;
                    existingItem.basePrice = basePrice;
                    existingItem.customPrice = customPrice;
                }
                
                const $item = this.createProductItem({
                    id: product.id,
                    name: product.name,
                    sku: product.sku,
                    price: product.price,
                    custom_price: product.custom_price,
                    image_url: product.image_url || '',
                    image_url_full: product.image_url_full || ''
                }, true);
                $container.append($item);
                
                // עדכון המחיר ב-orderItems לפי מה שמוצג ב-DOM (אם המוצר כבר קיים)
                if (existingItem) {
                    // חילוץ המחיר מה-DOM
                    let price = 0;
                    const $customPrice = $item.find('.custom-price');
                    if ($customPrice.length && $customPrice.text().includes('מחיר ללקוח')) {
                        const priceText = $customPrice.text().replace(/[^\d.]/g, '');
                        price = priceText ? parseFloat(priceText) : 0;
                    } else {
                        const $productPrice = $item.find('.product-price');
                        if ($productPrice.length) {
                            const priceText = $productPrice.text().replace(/[^\d.]/g, '');
                            price = priceText ? parseFloat(priceText) : 0;
                        } else {
                            const priceText = $customPrice.text().replace(/[^\d.]/g, '');
                            price = priceText ? parseFloat(priceText) : 0;
                        }
                    }
                    existingItem.price = price;
                }
            });
            
            // עדכון הסיכום אחרי הוספת כל המוצרים
            this.updateOrderSummary();
        },

        handleProductBrowseTab: function(e) {
            const tab = $(e.currentTarget).data('tab');
            $('.kfir-tab-btn').removeClass('active');
            $(e.currentTarget).addClass('active');
            
            // הסתרת כל הפאנלים
            $('#categories-panel').hide();
            $('#search-panel').hide();
            $('#purchased-panel').hide();
            
            if (tab === 'categories') {
                $('#categories-panel').show();
                this.loadCategories(0); // טעינת קטגוריות ראשיות
            } else if (tab === 'search') {
                $('#search-panel').show();
            } else if (tab === 'purchased') {
                $('#purchased-panel').show();
                // אם יש לקוח נבחר, נטען את המוצרים שנרכשו בעבר
                if (this.selectedCustomer && this.selectedCustomer.id) {
                    this.loadPurchasedProducts(this.selectedCustomer.id);
                }
            }
            
            // גלילה למעלה במובייל/טאבלט
            this.scrollToTop();
        },

        loadCategories: function(parentId = 0) {
            const $container = $('#categories-list');
            $container.empty();
            this.showLoader('#categories-list');
            
            // הסתרת מוצרים אם יש
            $('#category-products-wrap').hide();
            
            $.ajax({
                url: kfirAgentData.ajaxurl,
                type: 'GET',
                data: {
                    action: 'kfir_agent_get_categories',
                    nonce: kfirAgentData.nonce,
                    parent_id: parentId
                },
                success: (response) => {
                    this.hideLoader();
                    if (response.success && response.data.categories) {
                        this.displayCategories(response.data.categories, response.data.parent_id, response.data.parent_name);
                    } else {
                        $container.html('<div class="kfir-empty-state">לא נמצאו קטגוריות</div>');
                    }
                },
                error: () => {
                    this.hideLoader();
                    $container.html('<div class="kfir-empty-state">שגיאה בטעינת קטגוריות</div>');
                }
            });
        },

        displayCategories: function(categories, parentId = 0, parentName = '') {
            const $container = $('#categories-list');
            $container.empty();
            
            // הוספת כפתור חזרה אם יש parent (במבנה זהה לקטגוריה רגילה)
            if (parentId > 0 && parentName) {
                const $backItem = $(`
                    <div class="kfir-category-item kfir-category-back" data-back-button="1">
                        <span class="kfir-category-name">⬅️ חזרה</span>
                    </div>
                `);
                $backItem.on('click', () => {
                    this.loadCategories(0);
                });
                $container.append($backItem);
            }
            
            if (!categories.length) {
                $container.append('<div class="kfir-empty-state">לא נמצאו קטגוריות</div>');
                return;
            }
            
            categories.forEach((cat) => {
                const $item = $(`
                    <div class="kfir-category-item" 
                         data-category-id="${cat.id}" 
                         data-category-name="${(cat.name || '').replace(/"/g, '&quot;')}"
                         data-has-children="${cat.has_children ? '1' : '0'}">
                        <span class="kfir-category-name">${cat.name}</span>
                        ${cat.count > 0 ? `<span class="kfir-category-count">(${cat.count})</span>` : ''}
                        ${cat.has_children ? '<span class="kfir-category-has-children">📁</span>' : ''}
                    </div>
                `);
                $container.append($item);
            });
        },

        handleCategoryClick: function(e) {
            const $item = $(e.currentTarget);
            
            // דילוג על כפתור חזרה
            if ($item.data('back-button') == 1) {
                return;
            }
            
            const categoryId = $item.data('category-id');
            const categoryName = $item.data('category-name') || 'קטגוריה';
            const hasChildren = $item.data('has-children') == 1;
            
            $('.kfir-category-item').removeClass('active');
            $item.addClass('active');
            
            // אם יש תת-קטגוריות, נטען אותן. אחרת נטען מוצרים
            if (hasChildren) {
                this.loadCategories(categoryId);
            } else {
                this.loadCategoryProducts(categoryId, categoryName);
            }
        },

        loadCategoryProducts: function(categoryId, categoryName) {
            const $wrap = $('#category-products-wrap');
            const $list = $('#category-products-list');
            const $title = $('#category-products-title');
            $title.text('מוצרים בקטגוריה: ' + categoryName);
            $list.empty();
            this.showLoader('#category-products-list');
            $wrap.show();
            $.ajax({
                url: kfirAgentData.ajaxurl,
                type: 'GET',
                data: {
                    action: 'kfir_agent_get_products_by_category',
                    nonce: kfirAgentData.nonce,
                    category_id: categoryId,
                    customer_id: this.selectedCustomer ? this.selectedCustomer.id : 0
                },
                success: (response) => {
                    this.hideLoader();
                    if (response.success && response.data.products) {
                        this.displayCategoryProducts(response.data.products);
                    } else {
                        $list.html('<div class="kfir-empty-state">אין מוצרים בקטגוריה זו</div>');
                    }
                },
                error: () => {
                    this.hideLoader();
                    $list.html('<div class="kfir-empty-state">שגיאה בטעינת מוצרים</div>');
                }
            });
        },

        displayCategoryProducts: function(products) {
            const $container = $('#category-products-list');
            $container.empty();
            if (!products.length) {
                $container.html('<div class="kfir-empty-state">אין מוצרים בקטגוריה זו</div>');
                return;
            }
            products.forEach((product) => {
                // יצירת מוצר עם quantity controls (מתחיל ב-0)
                const $item = this.createProductItem({
                    id: product.id,
                    name: product.name,
                    sku: product.sku,
                    price: product.price,
                    custom_price: product.custom_price,
                    image_url: product.image_url || '',
                    image_url_full: product.image_url_full || ''
                }, false); // false = לא נרכש בעבר, אז quantity מתחיל ב-0
                $container.append($item);
            });
        },

        initProductSearch: function() {
            $('#product-search').select2({
                width: '100%',
                placeholder: 'חפש מוצר או SKU...',
                minimumInputLength: 2,
                ajax: {
                    delay: 250,
                    url: kfirAgentData.ajaxurl,
                    dataType: 'json',
                    data: (params) => {
                        return {
                            action: 'kfir_agent_search_products',
                            nonce: kfirAgentData.nonce,
                            q: params.term || ''
                        };
                    },
                    processResults: (data) => {
                        return data && data.results ? data : { results: [] };
                    }
                }
            }).on('select2:select', (e) => {
                const data = e.params.data;
                // בדיקה שהנתונים תקינים
                if (!data || !data.id) {
                    console.error('Invalid select2 data:', data);
                    this.showNotification('שגיאה: לא ניתן להוסיף את המוצר', 'error');
                    return;
                }
                this.addProductToOrder(data.id, data.text);
                $('#product-search').val(null).trigger('change');
            });
        },

        addProductToOrder: function(productId, productName) {
            // בדיקה שהמזהה תקין
            if (!productId || productId === undefined || productId === null) {
                console.error('Invalid productId:', productId);
                this.showNotification('שגיאה: מזהה מוצר לא תקין', 'error');
                return;
            }

            // המרה למספר אם צריך
            productId = parseInt(productId);
            if (isNaN(productId)) {
                console.error('Invalid productId (not a number):', productId);
                this.showNotification('שגיאה: מזהה מוצר לא תקין', 'error');
                return;
            }

            // בדיקה אם המוצר כבר קיים
            if (this.orderItems.find(item => item.id == productId)) {
                this.showNotification('המוצר כבר קיים בהזמנה', 'error');
                return;
            }

            this.showLoader('#all-products-list');

            // טעינת פרטי המוצר
            $.ajax({
                url: kfirAgentData.ajaxurl,
                type: 'GET',
                data: {
                    action: 'kfir_agent_get_product_details',
                    nonce: kfirAgentData.nonce,
                    product_id: productId,
                    customer_id: this.selectedCustomer ? this.selectedCustomer.id : 0
                },
                success: (response) => {
                    this.hideLoader();
                    if (response.success && response.data) {
                        const product = response.data;
                        // המרת המחירים למספרים (אם הם string)
                        const basePrice = parseFloat(product.price) || 0;
                        const customPrice = product.custom_price !== null && product.custom_price !== undefined 
                            ? parseFloat(product.custom_price) : null;
                        const finalPrice = product.final_price !== undefined 
                            ? parseFloat(product.final_price) : (customPrice !== null ? customPrice : basePrice);
                        
                        const item = {
                            id: parseInt(product.id) || productId,
                            name: product.name || productName || 'מוצר ללא שם',
                            price: finalPrice, // מחיר סופי לשימוש
                            basePrice: basePrice, // מחיר בסיסי לתצוגה
                            customPrice: customPrice, // מחיר מותאם לתצוגה
                            quantity: 1,
                            image_url: product.image_url || '',
                            image_url_full: product.image_url_full || ''
                        };
                        
                        // בדיקה שהפריט תקין לפני הוספה
                        if (!item.id || item.id === undefined || item.id === null) {
                            console.error('Invalid item after processing:', item, 'Original product:', product);
                            this.showNotification('שגיאה: לא ניתן להוסיף את המוצר', 'error');
                            return;
                        }
                        
                        this.orderItems.push(item);
                        this.displayProductInOrder(item);
                        this.updateOrderSummary();
                        this.saveState();
                    } else {
                        // אם יש שגיאה, נוסיף עם מחיר 0
                        const item = {
                            id: productId,
                            name: productName || 'מוצר ללא שם',
                            price: 0,
                            quantity: 1,
                            image_url: '',
                            image_url_full: ''
                        };
                        this.orderItems.push(item);
                        this.displayProductInOrder(item);
                        this.updateOrderSummary();
                        this.saveState();
                    }
                },
                error: (xhr, status, error) => {
                    this.hideLoader();
                    console.error('AJAX error:', status, error, xhr);
                    // אם אין endpoint, נוסיף עם מחיר 0
                    const item = {
                        id: productId,
                        name: productName || 'מוצר ללא שם',
                        price: 0,
                        quantity: 1,
                        image_url: '',
                        image_url_full: ''
                    };
                    this.orderItems.push(item);
                    this.displayProductInOrder(item);
                    this.updateOrderSummary();
                    this.saveState();
                }
            });
        },

        createProductItem: function(product, isPurchased = false) {
            const productId = product.id || product;
            const productName = product.name || product;
            const productPrice = product.price !== null && product.price !== undefined ? parseFloat(product.price) : null;
            const customPrice = product.custom_price !== null && product.custom_price !== undefined ? parseFloat(product.custom_price) : null;
            const imageUrl = product.image_url || '';
            const fullImageUrl = product.image_url_full || imageUrl || '';
            
            // קביעת מה להציג
            let priceDisplay = '';
            let customPriceDisplay = '';
            
            // אם יש מחיר מותאם שונה מהבסיסי
            if (customPrice !== null && customPrice !== undefined && productPrice !== null && customPrice != productPrice) {
                if (productPrice > 0) {
                    priceDisplay = `<span class="product-price">₪${productPrice.toFixed(2)}</span>`;
                }
                customPriceDisplay = `<span class="custom-price">מחיר ללקוח: ₪${customPrice.toFixed(2)}</span>`;
            } 
            // אם יש רק מחיר בסיסי
            else if (productPrice !== null && productPrice !== undefined) {
                if (productPrice > 0) {
                    priceDisplay = `<span class="product-price">₪${productPrice.toFixed(2)}</span>`;
                } else {
                    priceDisplay = '<span class="custom-price">₪0.00</span>';
                }
            }
            // אם אין מחיר בכלל
            else {
                customPriceDisplay = '<span class="custom-price">מחיר ייקבע בהמשך</span>';
            }

            return $(`
                <div class="product-item" data-product-id="${productId}">
                    <div class="product-image">
                        <img src="${imageUrl || kfirAgentData.placeholder_img}" 
                             alt="${productName}" 
                             class="kfir-product-image-clickable" 
                             data-full-image="${fullImageUrl || ''}"
                             onerror="this.onerror=null; this.src='${kfirAgentData.placeholder_img || ''}'">
                    </div>
                    <div class="product-details">
                        <strong>${productName}</strong>
                        ${product.sku ? `<span class="product-sku">SKU: ${product.sku}</span>` : ''}
                        ${priceDisplay}
                        ${customPriceDisplay}
                    </div>
                    <div class="quantity-controls">
                        <button class="quantity-minus" type="button">−</button>
                        <input type="number" class="product-quantity" value="${isPurchased ? '1' : '0'}" min="0" data-product-id="${productId}">
                        <button class="quantity-plus" type="button">+</button>
                    </div>
                </div>
            `);
        },

        displayProductInOrder: function(item) {
            const $container = $('#all-products-list');
            // שימוש במחיר הבסיסי והמותאם (אם קיים) לתצוגה
            const $itemElement = this.createProductItem({
                id: item.id,
                name: item.name,
                price: item.basePrice !== undefined ? item.basePrice : item.price,
                custom_price: item.customPrice !== undefined ? item.customPrice : (item.basePrice !== undefined && item.basePrice != item.price ? item.price : null),
                image_url: item.image_url || '',
                image_url_full: item.image_url_full || ''
            });
            $container.append($itemElement);
            
            // הגדרת כמות התחלתית ל-1 אם המוצר נבחר
            if (item.quantity >= 1) {
                $itemElement.find('.product-quantity').val(item.quantity || 1);
            }
        },

        updateOrderSummary: function() {
            // איסוף כל המוצרים עם quantity >= 1
            const selectedItems = [];
            
            $('.product-item').each(function() {
                const $item = $(this);
                const productId = $item.data('product-id');
                const quantity = parseInt($item.find('.product-quantity').val()) || 0;
                
                // רק מוצרים עם כמות >= 1 נחשבים כנבחרים
                if (quantity >= 1) {
                    const productName = $item.find('strong').text() || 'מוצר ללא שם';
                    
                    // ניסיון לחלץ מחיר מותאם, אחרת מחיר רגיל
                    let price = 0;
                    const $customPrice = $item.find('.custom-price');
                    if ($customPrice.length && $customPrice.text().includes('מחיר ללקוח')) {
                        // חילוץ מחיר מותאם
                        const priceText = $customPrice.text().replace(/[^\d.]/g, '');
                        price = priceText ? parseFloat(priceText) : 0;
                    } else {
                        // חילוץ מחיר רגיל
                        const $productPrice = $item.find('.product-price');
                        if ($productPrice.length) {
                            const priceText = $productPrice.text().replace(/[^\d.]/g, '');
                            price = priceText ? parseFloat(priceText) : 0;
                        } else {
                            // אם יש רק custom-price עם ₪0.00
                            const priceText = $customPrice.text().replace(/[^\d.]/g, '');
                            price = priceText ? parseFloat(priceText) : 0;
                        }
                    }

                    // חילוץ תמונות מה-DOM
                    const $productImg = $item.find('.product-image img');
                    const imageUrl = $productImg.attr('src') || '';
                    const imageUrlFull = $productImg.data('full-image') || '';

                    selectedItems.push({
                        id: productId,
                        name: productName,
                        quantity: quantity,
                        price: price,
                        image_url: imageUrl,
                        image_url_full: imageUrlFull
                    });
                }
            });

            let total = 0;
            selectedItems.forEach(item => {
                total += item.price * item.quantity;
            });

            $('#order-total').text(total.toFixed(2));
            
            // עדכון orderItems ושמירה
            this.orderItems = selectedItems;
            this.saveState();
        },

        proceedToCheckout: function() {
            if (!this.selectedCustomer) {
                this.showNotification('יש לבחור לקוח', 'error');
                return;
            }

            // איסוף הפריטים שנבחרו מה-DOM (כולל מוצרים שנרכשו בעבר)
            const selectedItems = [];
            
            // איסוף הפריטים - קודם מ-orderItems (אם יש), ואז מה-DOM
            // אם יש orderItems עם quantity >= 1, נשתמש בהם
            const itemsFromOrderItems = this.orderItems.filter(item => item.quantity >= 1);
            
            if (itemsFromOrderItems.length > 0) {
                // אם יש פריטים ב-orderItems, נשתמש בהם, אבל נשלים נתונים חסרים מה-DOM
                itemsFromOrderItems.forEach(item => {
                    // אם חסר שם או תמונה, ננסה למצוא מה-DOM
                    if (!item.name || !item.image_url) {
                        const $domItem = $(`.product-item[data-product-id="${item.id}"]`);
                        if ($domItem.length) {
                            if (!item.name) {
                                item.name = $domItem.find('strong').text() || 'מוצר ללא שם';
                            }
                            if (!item.image_url || !item.image_url_full) {
                                const $productImg = $domItem.find('.product-image img');
                                if (!item.image_url) item.image_url = $productImg.attr('src') || '';
                                if (!item.image_url_full) item.image_url_full = $productImg.data('full-image') || '';
                            }
                        }
                    }
                    selectedItems.push(item);
                });
            } else {
                // אחרת, נאסוף מה-DOM
                $('.product-item').each(function() {
                    const $item = $(this);
                    const quantity = parseInt($item.find('.product-quantity').val()) || 0;
                    
                    // דלג על מוצרים עם כמות 0
                    if (quantity < 1) {
                        return;
                    }
                    
                    const productId = parseInt($item.data('product-id'));
                    
                    // בדיקה שהמזהה תקין
                    if (!productId || isNaN(productId)) {
                        console.error('Invalid productId from DOM:', $item.data('product-id'), $item);
                        return;
                    }
                    const productName = $item.find('strong').text() || 'מוצר ללא שם';
                    
                    // ניסיון לחלץ מחיר מותאם, אחרת מחיר רגיל
                    let price = 0;
                    const $customPrice = $item.find('.custom-price');
                    if ($customPrice.length && $customPrice.text().includes('מחיר ללקוח')) {
                        // חילוץ מחיר מותאם
                        const priceText = $customPrice.text().replace(/[^\d.]/g, '');
                        price = priceText ? parseFloat(priceText) : 0;
                    } else {
                        // חילוץ מחיר רגיל
                        const $productPrice = $item.find('.product-price');
                        if ($productPrice.length) {
                            const priceText = $productPrice.text().replace(/[^\d.]/g, '');
                            price = priceText ? parseFloat(priceText) : 0;
                        } else {
                            // אם יש רק custom-price עם ₪0.00
                            const priceText = $customPrice.text().replace(/[^\d.]/g, '');
                            price = priceText ? parseFloat(priceText) : 0;
                        }
                    }

                    // חילוץ תמונות מה-DOM או מ-orderItems הקיימים
                    const $productImg = $item.find('.product-image img');
                    const imageUrl = $productImg.attr('src') || '';
                    const imageUrlFull = $productImg.data('full-image') || '';
                    
                    // אם אין תמונה ב-DOM, נחפש ב-orderItems הקיימים
                    let existingItem = this.orderItems.find(item => item.id == productId);
                    const finalImageUrl = imageUrl || (existingItem ? existingItem.image_url : '');
                    const finalImageUrlFull = imageUrlFull || (existingItem ? existingItem.image_url_full : '');

                    const item = {
                        id: productId,
                        name: productName,
                        quantity: quantity,
                        price: price,
                        image_url: finalImageUrl,
                        image_url_full: finalImageUrlFull
                    };
                    
                    // בדיקה שהפריט תקין לפני הוספה
                    if (!item.id || item.id === undefined || item.id === null) {
                        console.error('Invalid item before push:', item);
                        return;
                    }
                    
                    selectedItems.push(item);
                }.bind(this));
            }

            if (selectedItems.length === 0) {
                this.showNotification('יש לבחור לפחות מוצר אחד', 'error');
                return;
            }

            // עדכון this.orderItems עם הפריטים שנבחרו
            this.orderItems = selectedItems;

            // הצגת מסך סיכום
            this.displayCheckoutItems();
            this.showScreen('checkout');
            // גלילה למעלה במובייל/טאבלט
            this.scrollToTop();
        },

        displayCheckoutItems: function() {
            console.log('🟣 [DEBUG] displayCheckoutItems STARTED');
            console.log('🟣 [DEBUG] orderItems:', this.orderItems);
            console.log('🟣 [DEBUG] Number of items:', this.orderItems ? this.orderItems.length : 0);
            
            const $container = $('#checkout-items');
            console.log('🟣 [DEBUG] Container exists:', $container.length > 0);
            $container.empty();

            if (!this.orderItems || this.orderItems.length === 0) {
                console.warn('🟡 [DEBUG] No order items, showing empty state');
                $container.html('<tr><td colspan="5" class="kfir-empty-state">אין פריטים בהזמנה</td></tr>');
                return;
            }

            let total = 0;

            this.orderItems.forEach((item, index) => {
                if (!item || !item.id) {
                    console.error('🔴 [DEBUG] Invalid item at index', index, ':', item);
                    return;
                }

                const itemPrice = parseFloat(item.price) || 0;
                const itemQuantity = parseInt(item.quantity) || 1;
                const itemTotal = itemPrice * itemQuantity;
                total += itemTotal;
                
                console.log(`🟣 [DEBUG] Item ${index}:`, {
                    id: item.id,
                    name: item.name,
                    price: itemPrice,
                    quantity: itemQuantity,
                    itemTotal: itemTotal
                });

                const productImageUrl = item.image_url_full || item.image_url || '';
                const $row = $(`
                    <tr data-product-id="${item.id}" data-product-image="${productImageUrl || ''}">
                        <td>
                            <span class="checkout-product-name" style="cursor: pointer; text-decoration: underline; color: #3b82f6;">${item.name || 'מוצר ללא שם'}</span>
                        </td>
                        <td>
                            <input type="number" class="edit-price" value="${itemPrice.toFixed(2)}" step="0.01" min="0">
                        </td>
                        <td>
                            <input type="number" class="edit-quantity" value="${itemQuantity}" min="1">
                        </td>
                        <td class="item-total">₪${itemTotal.toFixed(2)}</td>
                        <td>
                            <button class="remove-item">🗑️</button>
                        </td>
                    </tr>
                `);
                $container.append($row);
                console.log(`🟣 [DEBUG] Added row for item ${item.id}`);
            });

            console.log('🟣 [DEBUG] Final total:', total);
            const $checkoutTotal = $('#checkout-total');
            console.log('🟣 [DEBUG] Checkout total element exists:', $checkoutTotal.length > 0);
            if ($checkoutTotal.length > 0) {
                $checkoutTotal.text(total.toFixed(2));
                console.log('🟣 [DEBUG] Set checkout total to:', total.toFixed(2));
            } else {
                console.error('🔴 [DEBUG] ERROR: Checkout total element not found!');
            }
            
            console.log('🟣 [DEBUG] displayCheckoutItems FINISHED');
        },

        updateCheckoutTotal: function() {
            console.log('🟢 [DEBUG] updateCheckoutTotal STARTED');
            console.log('🟢 [DEBUG] Current screen:', this.currentScreen);
            console.log('🟢 [DEBUG] Number of rows:', $('#checkout-items tr[data-product-id]').length);
            
            let total = 0;
            const updatedItems = [];

            const $checkoutItems = $('#checkout-items');
            console.log('🟢 [DEBUG] Checkout items container exists:', $checkoutItems.length > 0);
            console.log('🟢 [DEBUG] Checkout items HTML:', $checkoutItems.html().substring(0, 200));
            
            // בדיקה אם יש rows בכלל
            const $allRows = $checkoutItems.find('tr');
            console.log('🟢 [DEBUG] Total rows in tbody:', $allRows.length);
            const $rowsWithData = $checkoutItems.find('tr[data-product-id]');
            console.log('🟢 [DEBUG] Rows with data-product-id:', $rowsWithData.length);
            
            // אם אין rows עם data-product-id, ננסה למצוא את כל ה-rows
            const $rowsToProcess = $rowsWithData.length > 0 ? $rowsWithData : $allRows;
            console.log('🟢 [DEBUG] Processing', $rowsToProcess.length, 'rows');
            console.log('🟢 [DEBUG] Starting loop...');

            // שימוש בלולאת for רגילה במקום each כדי לוודא שאנחנו עובדים עם ה-DOM elements הנכונים
            for (let index = 0; index < $rowsToProcess.length; index++) {
                try {
                    console.log(`🟢 [DEBUG] === Processing row ${index} ===`);
                    const rowElement = $rowsToProcess[index];
                    const $row = $(rowElement);
                    console.log(`🟢 [DEBUG] Row ${index} element exists:`, !!rowElement, 'jQuery length:', $row.length);
                    // נשתמש ב-jQuery כדי לקבל את ה-HTML
                    const rowHTML = rowElement && rowElement.outerHTML ? rowElement.outerHTML.substring(0, 300) : (rowElement ? 'Element exists but no outerHTML' : 'No row element');
                    console.log(`🟢 [DEBUG] Row ${index} HTML:`, rowHTML);
                
                // שימוש ב-jQuery בלבד לקבלת data-product-id
                const productIdAttrJQuery = $row.attr('data-product-id');
                const productIdData = $row.data('product-id'); 
                
                console.log(`🟢 [DEBUG] Row ${index} data-product-id (attr):`, productIdAttrJQuery); 
                console.log(`🟢 [DEBUG] Row ${index} data-product-id (data):`, productIdData);
                 
                // ניסיון לקבל את ה-product-id בכל דרך אפשרית
                const productId = parseInt(productIdAttrJQuery) || parseInt(productIdData) || 0;
                
                // חיפוש ה-inputs בתוך ה-row
                const $priceInput = $row.find('.edit-price');
                const $quantityInput = $row.find('.edit-quantity');
                
                // בדיקה אם ה-inputs נמצאים ישירות ב-row או בתוך td
                const rowHTMLFull = $row.length > 0 && $row[0].outerHTML ? $row[0].outerHTML.substring(0, 500) : 'No element or no outerHTML';
                console.log(`🟢 [DEBUG] Row ${index} structure:`, {
                    rowHTML: rowHTMLFull,
                    hasTdChildren: $row.find('td').length,
                    directInputs: $row.children('input').length,
                    priceInputInRow: $row.find('.edit-price').length,
                    quantityInputInRow: $row.find('.edit-quantity').length,
                    allInputs: $row.find('input').length,
                    allInputsHTML: $row.find('input').map(function() { 
                        return this.outerHTML ? this.outerHTML : 'No outerHTML'; 
                    }).get()
                });
                
                const price = parseFloat($priceInput.val()) || 0;
                const quantity = parseInt($quantityInput.val()) || 1;
                const itemTotal = price * quantity;
                const productImageUrl = $row.attr('data-product-image') || $row.data('product-image') || '';
                
                console.log(`🟢 [DEBUG] Row ${index}:`, {
                    productIdAttrJQuery: productIdAttrJQuery,
                    productIdData: productIdData,
                    productId: productId,
                    price: price,
                    quantity: quantity,
                    itemTotal: itemTotal,
                    priceInputExists: $priceInput.length > 0,
                    quantityInputExists: $quantityInput.length > 0,
                    priceInputValue: $priceInput.val(),
                    quantityInputValue: $quantityInput.val(),
                    priceInputElement: $priceInput[0] && $priceInput[0].outerHTML ? $priceInput[0].outerHTML : ($priceInput[0] ? 'Element exists but no outerHTML' : 'Not found'),
                    quantityInputElement: $quantityInput[0] && $quantityInput[0].outerHTML ? $quantityInput[0].outerHTML : ($quantityInput[0] ? 'Element exists but no outerHTML' : 'Not found'),
                    rowChildren: $row.children().length,
                    rowTdCount: $row.find('td').length
                });
                
                const $itemTotalCell = $row.find('.item-total');
                console.log(`🟢 [DEBUG] Item total cell search:`, {
                    found: $itemTotalCell.length > 0,
                    selector: '.item-total',
                    allCells: $row.find('td').length,
                    cellHTML: $row.find('td').map(function(i) { 
                        return `TD ${i}: ${$(this).text().substring(0, 50)} (has class item-total: ${$(this).hasClass('item-total')})`; 
                    }).get(),
                    itemTotalCellHTML: $itemTotalCell.length > 0 && $itemTotalCell[0].outerHTML ? $itemTotalCell[0].outerHTML : ($itemTotalCell.length > 0 ? 'Element exists but no outerHTML' : 'Not found')
                });
                
                if ($itemTotalCell.length > 0) {
                    $itemTotalCell.text('₪' + itemTotal.toFixed(2));
                    console.log(`🟢 [DEBUG] Updated item total cell to: ₪${itemTotal.toFixed(2)}`);
                } else {
                    console.error(`🔴 [DEBUG] ERROR: Item total cell not found for row ${index}`);
                    // ננסה למצוא את התא הרביעי (סה"כ)
                    const $fourthTd = $row.find('td').eq(3);
                    if ($fourthTd.length > 0) {
                        const fourthTdHTML = $fourthTd[0].outerHTML ? $fourthTd[0].outerHTML : 'Element exists but no outerHTML';
                        console.log(`🟢 [DEBUG] Found fourth TD, updating it instead:`, fourthTdHTML);
                        $fourthTd.text('₪' + itemTotal.toFixed(2));
                    }
                }
                
                total += itemTotal;
                
                // עדכון orderItems עם המחיר והכמות המעודכנים
                const existingItem = this.orderItems.find(item => item.id == productId); 
                if (existingItem) {
                    existingItem.price = price;
                    existingItem.quantity = quantity;
                    if (productImageUrl) {
                        existingItem.image_url_full = productImageUrl;
                    }
                    console.log(`🟢 [DEBUG] Updated orderItems for product ${productId}:`, existingItem);
                } else {
                    console.warn(`🟡 [DEBUG] WARNING: No existing item found for product ${productId}`);
                }
                console.log(`🟢 [DEBUG] === Finished processing row ${index} ===`);
                } catch (error) {
                    console.error(`🔴 [DEBUG] ERROR processing row ${index}:`, error);
                    console.error(`🔴 [DEBUG] Error stack:`, error.stack);
                }
            }

            // הוספת דמי משלוח אם נבחרה שיטת משלוח
            const shippingCost = parseFloat($('#shipping-cost').val()) || 0;
            total += shippingCost;
            
            console.log('🟢 [DEBUG] Final total:', total);
            console.log('🟢 [DEBUG] Shipping cost:', shippingCost);
            
            const $checkoutTotal = $('#checkout-total');
            console.log('🟢 [DEBUG] Checkout total element exists:', $checkoutTotal.length > 0);
            if ($checkoutTotal.length > 0) {
                $checkoutTotal.text(total.toFixed(2));
                console.log('🟢 [DEBUG] Updated checkout total to:', total.toFixed(2));
            } else {
                console.error('🔴 [DEBUG] ERROR: Checkout total element not found!');
            }
            
            console.log('🟢 [DEBUG] updateCheckoutTotal FINISHED');
        },

        removeItem: function(e) {
            // הצגת התראה לפני מחיקה
            if (!confirm('האם אתה בטוח שברצונך למחוק את המוצר מההזמנה?')) {
                return; // המשתמש ביטל את הפעולה
            }
            
            const $row = $(e.currentTarget).closest('tr');
            const productId = $row.data('product-id');
            
            // הסרה מהרשימה
            this.orderItems = this.orderItems.filter(item => item.id != productId);
            
            // עדכון גם ברשימת המוצרים במסך ההזמנה
            $(`.product-item[data-product-id="${productId}"]`).find('.product-quantity').val(0).trigger('change');
            
            $row.fadeOut(300, () => {
                $row.remove();
                this.updateCheckoutTotal();
                // שמירת מצב מעודכן
                this.saveState();
            });
        },

        finalizeOrder: function() {
            if (!this.selectedCustomer) {
                this.showNotification('יש לבחור לקוח', 'error');
                return;
            }

            // עדכון הפריטים עם המחירים והכמויות המעודכנים
            const updatedItems = [];
            $('#checkout-items tr[data-product-id]').each(function() {
                const $row = $(this);
                const productId = $row.data('product-id');
                if (!productId) {
                    console.error('Missing product-id for row:', $row);
                    return;
                }
                updatedItems.push({
                    id: productId,
                    quantity: parseInt($row.find('.edit-quantity').val()) || 1,
                    price: parseFloat($row.find('.edit-price').val()) || 0
                });
            });

            if (updatedItems.length === 0) {
                this.showNotification('יש לבחור לפחות מוצר אחד', 'error');
                return;
            }

            const paymentMethod = $('input[name="payment_method"]:checked').val();
            if (!paymentMethod) {
                this.showNotification('יש לבחור שיטת תשלום', 'error');
                return;
            }

            // קבלת שיטת משלוח ודמי משלוח
            const shippingMethod = $('input[name="shipping_method"]:checked').val() || '';
            const shippingCost = parseFloat($('#shipping-cost').val()) || 0;

            // הצגת loader
            this.showLoader('.checkout-summary');
            $('.finalize-order').prop('disabled', true).text('יוצר הזמנה...');

            // שליחת בקשה ליצירת הזמנה
            $.ajax({
                url: kfirAgentData.ajaxurl,
                type: 'POST',
                data: {
                    action: 'kfir_agent_create_order',
                    nonce: kfirAgentData.nonce,
                    customer_id: this.selectedCustomer.id,
                    items: updatedItems,
                    payment_method: paymentMethod,
                    shipping_method: shippingMethod,
                    shipping_cost: shippingCost
                },
                success: (response) => {
                    this.hideLoader();
                    $('.finalize-order').prop('disabled', false).text('✅ סיים הזמנה');
                    if (response.success) {
                        // שמירת order_id
                        this.currentOrderId = response.data.order_id;
                        
                        $('#order-number').text('#' + response.data.order_number);
                        $('#success-order-total').text('₪' + parseFloat(response.data.total).toFixed(2));
                        
                        this.showScreen('order-success');
                        
                        // הצגת כפתורי iCount אם יש order_id
                        if (this.currentOrderId) {
                            $('#icount-documents-buttons').show();
                        }
                        
                        // ניקוי כל הסטייט אחרי סיום הזמנה (אבל לא currentOrderId - נצטרך אותו לכפתורי iCount)
                        this.orderItems = [];
                        this.selectedCustomer = null;
                        this.clearState();
                        
                        // ניקוי ה-DOM
                        $('#all-products-list').empty();
                        $('#purchased-products-list').empty();
                        $('#category-products-list').empty();
                        $('#checkout-items').empty();
                        $('#selected-customer-name').text('-');
                        $('#checkout-customer-name').text('-');
                        $('#order-total').text('0.00');
                        $('#checkout-total').text('0.00');
                        
                        // איפוס כמות כל המוצרים
                        $('.product-item .product-quantity').val(0);
                        
                        // חזרה לטאב קטגוריות
                        $('.kfir-tab-btn[data-tab="categories"]').addClass('active');
                        $('.kfir-tab-btn').not('[data-tab="categories"]').removeClass('active');
                        $('#categories-panel').show();
                        $('#search-panel').hide();
                        $('#purchased-panel').hide();
                        $('#category-products-wrap').hide();
                    } else {
                        this.showNotification(response.data?.message || 'שגיאה ביצירת הזמנה', 'error');
                    }
                },
                error: () => {
                    this.hideLoader();
                    $('.finalize-order').prop('disabled', false).text('✅ סיים הזמנה');
                    this.showNotification('שגיאה ביצירת הזמנה', 'error');
                }
            });
        },

        handleNewCustomer: function(e) {
            e.preventDefault();
            const $form = $(e.target);
            const formData = new FormData($form[0]);

            formData.append('action', 'kfir_agent_create_customer');
            formData.append('nonce', kfirAgentData.nonce);

            this.showLoader('.kfir-agent-form');
            $form.find('button[type="submit"]').prop('disabled', true).text('יוצר לקוח...');

            $.ajax({
                url: kfirAgentData.ajaxurl,
                type: 'POST',
                data: formData,
                processData: false,
                contentType: false,
                success: (response) => {
                    this.hideLoader();
                    $form.find('button[type="submit"]').prop('disabled', false).text('שמור לקוח');
                    if (response.success) {
                        this.showNotification('הלקוח נוצר בהצלחה', 'success');
                        // מעבר למסך הזמנה חדשה עם הלקוח שנוצר
                        this.selectedCustomer = {
                            id: response.data.user_id,
                            name: response.data.customer_name
                        };
                        $('#selected-customer-name').text(response.data.customer_name);
                        this.showScreen('new-order');
                        $form[0].reset();
                    } else {
                        this.showNotification(response.data?.message || 'שגיאה ביצירת לקוח', 'error');
                    }
                },
                error: () => {
                    this.hideLoader();
                    $form.find('button[type="submit"]').prop('disabled', false).text('שמור לקוח');
                    this.showNotification('שגיאה ביצירת לקוח', 'error');
                }
            });
        },

        showNotification: function(message, type = 'success') {
            const $notification = $(`
                <div class="kfir-notification kfir-notification-${type}">
                    ${message}
                </div>
            `);
            
            $('body').append($notification);
            
            setTimeout(() => {
                $notification.addClass('show');
            }, 100);
            
            setTimeout(() => {
                $notification.removeClass('show');
                setTimeout(() => $notification.remove(), 300);
            }, 3000);
        },

        debounce: function(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        },

        showLoader: function(selector) {
            const $target = $(selector);
            if ($target.find('.kfir-loader').length === 0) {
                $target.append(`
                    <div class="kfir-loader">
                        <div class="kfir-spinner"></div>
                        <p>טוען...</p>
                    </div>
                `);
            }
        },

        hideLoader: function() {
            $('.kfir-loader').remove();
        },

        openImageLightbox: function(e) {
            e.stopPropagation();
            const $img = $(e.target);
            const thumbnailSrc = $img.attr('src');
            const fullImageSrc = $img.data('full-image') || thumbnailSrc;
            const imageAlt = $img.attr('alt') || '';
            
            if (!thumbnailSrc || thumbnailSrc === kfirAgentData.placeholder_img || !fullImageSrc) {
                return; // לא לפתוח lightbox לתמונת placeholder או אם אין תמונה מלאה
            }
            
            // הצגת תמונה קטנה תחילה, ואז החלפה לתמונה גדולה
            const $lightboxImg = $('.kfir-lightbox-image');
            $lightboxImg.attr('src', thumbnailSrc).attr('alt', imageAlt);
            $('.kfir-lightbox-overlay').fadeIn(300);
            $('body').css('overflow', 'hidden');
            
            // טעינת התמונה המלאה
            const fullImg = new Image();
            fullImg.onload = function() {
                $lightboxImg.attr('src', fullImageSrc);
            };
            fullImg.src = fullImageSrc;
        },

        closeImageLightbox: function(e) {
            e.stopPropagation();
            $('.kfir-lightbox-overlay').fadeOut(300);
            $('body').css('overflow', '');
        },

        openProductImageLightbox: function(e) {
            e.preventDefault();
            e.stopPropagation();
            const $row = $(e.target).closest('tr');
            let imageSrc = $row.data('product-image');
            
            // אם אין תמונה ב-data attribute, ננסה למצוא ב-orderItems
            if (!imageSrc || imageSrc === '') {
                const productId = parseInt($row.data('product-id'));
                const existingItem = this.orderItems.find(item => item.id == productId);
                if (existingItem) {
                    imageSrc = existingItem.image_url_full || existingItem.image_url || '';
                }
            }
            
            if (!imageSrc || imageSrc === '' || imageSrc === kfirAgentData.placeholder_img) {
                this.showNotification('אין תמונה זמינה למוצר זה', 'error');
                return; // לא לפתוח lightbox אם אין תמונה או זה placeholder
            }
            
            const productName = $(e.target).text() || '';
            
            // הצגת התמונה ב-lightbox
            const $lightboxImg = $('.kfir-lightbox-image');
            $lightboxImg.attr('src', imageSrc).attr('alt', productName);
            $('.kfir-lightbox-overlay').fadeIn(300);
            $('body').css('overflow', 'hidden');
        },

        createIcountDocument: function(e) {
            if (!this.currentOrderId) {
                this.showNotification('מספר הזמנה לא נמצא', 'error');
                return;
            }

            const $btn = $(e.currentTarget);
            const docType = $btn.data('doc-type');
            const originalText = $btn.html();
            
            // שמות מסמכים בעברית
            const docNames = {
                'invoice': 'חשבונית',
                'receipt': 'קבלה',
                'quote': 'הצעת מחיר',
                'invrec': 'חשבונית מס קבלה'
            };
            
            const docName = docNames[docType] || 'מסמך';
            
            // הצגת טעינה
            $btn.prop('disabled', true).html('יוצר ' + docName + '...');
            $('#icount-documents-status').html('');

            $.ajax({
                url: kfirAgentData.ajaxurl,
                type: 'POST',
                data: {
                    action: 'kfir_agent_create_icount_document',
                    nonce: kfirAgentData.nonce,
                    order_id: this.currentOrderId,
                    doc_type: docType
                },
                success: (response) => {
                    $btn.prop('disabled', false).html(originalText);
                    
                    if (response.success) {
                        let statusHtml = '<div style="color: #28a745; font-weight: 600; padding: 10px; background: #d4edda; border-radius: 4px; margin-top: 10px;">';
                        statusHtml += '✅ ' + response.data.message;
                        
                        if (response.data.doc_url) {
                            statusHtml += '<br/><a href="' + response.data.doc_url + '" target="_blank" style="color: #155724; text-decoration: underline; margin-top: 5px; display: inline-block;">צפה ב' + docName + '</a>';
                        }
                        
                        statusHtml += '</div>';
                        $('#icount-documents-status').html(statusHtml);
                        this.showNotification(response.data.message, 'success');
                    } else {
                        $('#icount-documents-status').html(
                            '<div style="color: #dc3545; font-weight: 600; padding: 10px; background: #f8d7da; border-radius: 4px; margin-top: 10px;">❌ ' + 
                            (response.data?.message || 'שגיאה ביצירת המסמך') + 
                            '</div>'
                        );
                        this.showNotification(response.data?.message || 'שגיאה ביצירת המסמך', 'error');
                    }
                },
                error: () => {
                    $btn.prop('disabled', false).html(originalText);
                    $('#icount-documents-status').html(
                        '<div style="color: #dc3545; font-weight: 600; padding: 10px; background: #f8d7da; border-radius: 4px; margin-top: 10px;">❌ שגיאה ביצירת המסמך</div>'
                    );
                    this.showNotification('שגיאה ביצירת המסמך', 'error');
                }
            });
        }
    };

    $(document).ready(function() {
        KfirAgent.init();
        
        // אם המשתמש התחבר בהצלחה דרך SMS auth, נטען מחדש את הדף
        $(document).on('sms_auth_success', function() {
            window.location.reload();
        });
    });

})(jQuery);
