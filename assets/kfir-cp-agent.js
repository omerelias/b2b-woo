(function($) {
    'use strict';

    const KfirAgent = {
        currentScreen: 'dashboard',
        selectedCustomer: null,
        orderItems: [],

        init: function() {
            this.bindEvents();
            // אם המשתמש לא מחובר, נציג את מסך ההתחברות
            if (!kfirAgentData.is_logged_in) {
                this.showScreen('login');
            } else {
                this.showScreen('dashboard');
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
                    const existingItem = this.orderItems.find(item => item.id == productId);
                    if (quantity >= 1) {
                        if (existingItem) {
                            existingItem.quantity = quantity;
                            existingItem.price = price;
                        } else {
                            // הוספה אם הכמות >= 1
                            this.orderItems.push({
                                id: productId,
                                name: productName,
                                price: price,
                                quantity: quantity
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
            }.bind(this));
            
            // המשך לתשלום
            $(document).on('click', '.proceed-checkout', this.proceedToCheckout.bind(this));
            
            // טאבים: קטגוריות / חיפוש מוצרים / מוצרים שנרכשו בעבר
            $(document).on('click', '.kfir-tab-btn', this.handleProductBrowseTab.bind(this));
            $(document).on('click', '.kfir-category-item', this.handleCategoryClick.bind(this));
            
            // עריכת מחיר וכמות במסך סיכום
            $(document).on('change', '.edit-price, .edit-quantity', this.updateCheckoutTotal.bind(this));
            
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
            
            // סיום הזמנה
            $(document).on('click', '.finalize-order', this.finalizeOrder.bind(this));
        },

        showScreen: function(screenName) {
            $('.kfir-screen').hide();
            $('#screen-' + screenName).show();
            this.currentScreen = screenName;
            // גלילה למעלה במובייל/טאבלט
            this.scrollToTop();
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
            this.showScreen(screenName);
            
            // אם עוברים למסך הזמנה חדשה, צריך לבחור לקוח
            if (screenName === 'new-order') {
                this.showScreen('find-customer');
            }
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
            this.loadCategories();
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
                    image_url: product.image_url || ''
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
                this.loadCategories();
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

        loadCategories: function() {
            const $container = $('#categories-list');
            $container.empty().html('<div class="kfir-loading">טוען קטגוריות...</div>');
            $.ajax({
                url: kfirAgentData.ajaxurl,
                type: 'GET',
                data: {
                    action: 'kfir_agent_get_categories',
                    nonce: kfirAgentData.nonce
                },
                success: (response) => {
                    if (response.success && response.data.categories) {
                        this.displayCategories(response.data.categories);
                    } else {
                        $container.html('<div class="kfir-empty-state">לא נמצאו קטגוריות</div>');
                    }
                },
                error: () => {
                    $container.html('<div class="kfir-empty-state">שגיאה בטעינת קטגוריות</div>');
                }
            });
        },

        displayCategories: function(categories) {
            const $container = $('#categories-list');
            $container.empty();
            if (!categories.length) {
                $container.html('<div class="kfir-empty-state">לא נמצאו קטגוריות</div>');
                return;
            }
            categories.forEach((cat) => {
                const $item = $(`
                    <div class="kfir-category-item" data-category-id="${cat.id}" data-category-name="${(cat.name || '').replace(/"/g, '&quot;')}">
                        <span class="kfir-category-name">${cat.name}</span>
                        ${cat.count > 0 ? `<span class="kfir-category-count">(${cat.count})</span>` : ''}
                    </div>
                `);
                $container.append($item);
            });
        },

        handleCategoryClick: function(e) {
            const $item = $(e.currentTarget);
            const categoryId = $item.data('category-id');
            const categoryName = $item.data('category-name') || 'קטגוריה';
            $('.kfir-category-item').removeClass('active');
            $item.addClass('active');
            this.loadCategoryProducts(categoryId, categoryName);
        },

        loadCategoryProducts: function(categoryId, categoryName) {
            const $wrap = $('#category-products-wrap');
            const $list = $('#category-products-list');
            const $title = $('#category-products-title');
            $title.text('מוצרים בקטגוריה: ' + categoryName);
            $list.empty().html('<div class="kfir-loading">טוען מוצרים...</div>');
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
                    if (response.success && response.data.products) {
                        this.displayCategoryProducts(response.data.products);
                    } else {
                        $list.html('<div class="kfir-empty-state">אין מוצרים בקטגוריה זו</div>');
                    }
                },
                error: () => {
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
                    image_url: product.image_url || ''
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
                            image_url: product.image_url || ''
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
                    } else {
                        // אם יש שגיאה, נוסיף עם מחיר 0
                        const item = {
                            id: productId,
                            name: productName || 'מוצר ללא שם',
                            price: 0,
                            quantity: 1
                        };
                        this.orderItems.push(item);
                        this.displayProductInOrder(item);
                        this.updateOrderSummary();
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
                        quantity: 1
                    };
                    this.orderItems.push(item);
                    this.displayProductInOrder(item);
                    this.updateOrderSummary();
                }
            });
        },

        createProductItem: function(product, isPurchased = false) {
            const productId = product.id || product;
            const productName = product.name || product;
            const productPrice = product.price !== null && product.price !== undefined ? parseFloat(product.price) : null;
            const customPrice = product.custom_price !== null && product.custom_price !== undefined ? parseFloat(product.custom_price) : null;
            const imageUrl = product.image_url || '';
            
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
                        <img src="${imageUrl || kfirAgentData.placeholder_img}" alt="${productName}" onerror="this.onerror=null; this.src='${kfirAgentData.placeholder_img || ''}'">
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
                image_url: item.image_url || ''
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

                    selectedItems.push({
                        id: productId,
                        quantity: quantity,
                        price: price
                    });
                }
            });

            let total = 0;
            selectedItems.forEach(item => {
                total += item.price * item.quantity;
            });

            $('#order-total').text(total.toFixed(2));
        },

        proceedToCheckout: function() {
            if (!this.selectedCustomer) {
                this.showNotification('יש לבחור לקוח', 'error');
                return;
            }

            // איסוף הפריטים שנבחרו מה-DOM (כולל מוצרים שנרכשו בעבר)
            const selectedItems = [];
            
            // איסוף מכל הרשימות (מוצרים שנרכשו + כל המוצרים) - רק מוצרים עם quantity >= 1
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

                const item = {
                    id: productId,
                    name: productName,
                    quantity: quantity,
                    price: price
                };
                
                // בדיקה שהפריט תקין לפני הוספה
                if (!item.id || item.id === undefined || item.id === null) {
                    console.error('Invalid item before push:', item);
                    return;
                }
                
                selectedItems.push(item);
            });

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
            const $container = $('#checkout-items');
            $container.empty();

            if (!this.orderItems || this.orderItems.length === 0) {
                $container.html('<tr><td colspan="5" class="kfir-empty-state">אין פריטים בהזמנה</td></tr>');
                return;
            }

            let total = 0;

            this.orderItems.forEach((item) => {
                if (!item || !item.id) {
                    console.error('Invalid item:', item);
                    return;
                }

                const itemPrice = parseFloat(item.price) || 0;
                const itemQuantity = parseInt(item.quantity) || 1;
                const itemTotal = itemPrice * itemQuantity;
                total += itemTotal;

                const $row = $(`
                    <tr data-product-id="${item.id}">
                        <td>${item.name || 'מוצר ללא שם'}</td>
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
            });

            $('#checkout-total').text(total.toFixed(2));
        },

        updateCheckoutTotal: function() {
            let total = 0;

            $('#checkout-items tr').each(function() {
                const $row = $(this);
                const price = parseFloat($row.find('.edit-price').val()) || 0;
                const quantity = parseInt($row.find('.edit-quantity').val()) || 1;
                const itemTotal = price * quantity;
                
                $row.find('.item-total').text('₪' + itemTotal.toFixed(2));
                total += itemTotal;
            });

            // הוספת דמי משלוח אם נבחרה שיטת משלוח
            const shippingCost = parseFloat($('#shipping-cost').val()) || 0;
            total += shippingCost;

            $('#checkout-total').text(total.toFixed(2));
        },

        removeItem: function(e) {
            const $row = $(e.currentTarget).closest('tr');
            const productId = $row.data('product-id');
            
            // הסרה מהרשימה
            this.orderItems = this.orderItems.filter(item => item.id != productId);
            
            $row.fadeOut(300, () => {
                $row.remove();
                this.updateCheckoutTotal();
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
                        $('#order-number').text('#' + response.data.order_number);
                        $('#success-order-total').text('₪' + parseFloat(response.data.total).toFixed(2));
                        this.showScreen('order-success');
                        this.orderItems = [];
                        this.selectedCustomer = null;
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
