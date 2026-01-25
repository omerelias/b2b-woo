(function($) {
    'use strict';

    const KfirAgent = {
        currentScreen: 'dashboard',
        selectedCustomer: null,
        orderItems: [],

        init: function() {
            this.bindEvents();
            this.showScreen('dashboard');
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
            
            // checkbox מוצרים
            $(document).on('change', '.product-checkbox', this.updateOrderSummary.bind(this));
            
            // עריכת כמות
            $(document).on('change', '.product-quantity', this.updateOrderSummary.bind(this));
            
            // המשך לתשלום
            $(document).on('click', '.proceed-checkout', this.proceedToCheckout.bind(this));
            
            // עריכת מחיר וכמות במסך סיכום
            $(document).on('change', '.edit-price, .edit-quantity', this.updateCheckoutTotal.bind(this));
            
            // מחיקת פריט
            $(document).on('click', '.remove-item', this.removeItem.bind(this));
            
            // סיום הזמנה
            $(document).on('click', '.finalize-order', this.finalizeOrder.bind(this));
        },

        showScreen: function(screenName) {
            $('.kfir-screen').hide();
            $('#screen-' + screenName).show();
            this.currentScreen = screenName;
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

            $.ajax({
                url: kfirAgentData.ajaxurl,
                type: 'GET',
                data: {
                    action: 'kfir_agent_search_customers',
                    nonce: kfirAgentData.nonce,
                    q: searchTerm
                },
                success: (response) => {
                    if (response.success || response.results) {
                        this.displayCustomerResults(response.results || []);
                    } else {
                        this.showNotification('שגיאה בחיפוש לקוחות', 'error');
                    }
                },
                error: () => {
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
                const displayName = customer.business_name || customer.name || 'לקוח ללא שם';
                const $result = $(`
                    <div class="customer-result" data-customer-id="${customer.id}">
                        <strong>${displayName}</strong><br>
                        <small>${customer.name || ''}${customer.phone ? ' | ' + customer.phone : ''}</small>
                    </div>
                `);
                $container.append($result);
            });
        },

        selectCustomer: function(e) {
            const customerId = $(e.currentTarget).data('customer-id');
            const customerName = $(e.currentTarget).find('strong').text();
            
            this.selectedCustomer = {
                id: customerId,
                name: customerName
            };

            $('#selected-customer-name').text(customerName);
            $('#checkout-customer-name').text(customerName);
            $('#success-customer-name').text(customerName);

            // טעינת מוצרים שנרכשו בעבר
            this.loadPurchasedProducts(customerId);

            // מעבר למסך יצירת הזמנה
            this.showScreen('new-order');
        },

        loadPurchasedProducts: function(customerId) {
            $.ajax({
                url: kfirAgentData.ajaxurl,
                type: 'POST',
                data: {
                    action: 'kfir_agent_get_customer_orders',
                    nonce: kfirAgentData.nonce,
                    customer_id: customerId
                },
                success: (response) => {
                    if (response.success && response.data.products.length > 0) {
                        this.displayPurchasedProducts(response.data.products);
                        $('#purchased-products-section').show();
                    } else {
                        $('#purchased-products-section').hide();
                    }
                },
                error: () => {
                    $('#purchased-products-section').hide();
                }
            });
        },

        displayPurchasedProducts: function(products) {
            const $container = $('#purchased-products-list');
            $container.empty();

            products.forEach((product) => {
                const $item = this.createProductItem({
                    id: product.id,
                    name: product.name,
                    sku: product.sku,
                    price: product.price,
                    custom_price: product.custom_price
                }, true);
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
                this.addProductToOrder(data.id, data.text);
                $('#product-search').val(null).trigger('change');
            });
        },

        addProductToOrder: function(productId, productName) {
            // בדיקה אם המוצר כבר קיים
            if (this.orderItems.find(item => item.id == productId)) {
                this.showNotification('המוצר כבר קיים בהזמנה', 'error');
                return;
            }

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
                    if (response.success) {
                        const product = response.data || {};
                        const item = {
                            id: productId,
                            name: product.name || productName,
                            price: product.price || 0,
                            quantity: 1
                        };
                        this.orderItems.push(item);
                        this.displayProductInOrder(item);
                        this.updateOrderSummary();
                    } else {
                        // אם יש שגיאה, נוסיף עם מחיר 0
                        const item = {
                            id: productId,
                            name: productName,
                            price: 0,
                            quantity: 1
                        };
                        this.orderItems.push(item);
                        this.displayProductInOrder(item);
                        this.updateOrderSummary();
                    }
                },
                error: () => {
                    // אם אין endpoint, נוסיף עם מחיר 0
                    const item = {
                        id: productId,
                        name: productName,
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
            const productPrice = parseFloat(product.price || 0);
            const customPrice = product.custom_price ? parseFloat(product.custom_price) : null;
            const displayPrice = customPrice || productPrice;

            return $(`
                <div class="product-item" data-product-id="${productId}">
                    <input type="checkbox" class="product-checkbox" ${isPurchased ? 'checked' : ''}>
                    <div class="product-details">
                        <strong>${productName}</strong>
                        ${product.sku ? `<span class="product-sku">SKU: ${product.sku}</span>` : ''}
                        ${productPrice > 0 ? `<span class="product-price">₪${productPrice.toFixed(2)}</span>` : ''}
                        ${customPrice && customPrice != productPrice ? `<span class="custom-price">מחיר ללקוח: ₪${customPrice.toFixed(2)}</span>` : ''}
                        ${!customPrice && productPrice == 0 ? '<span class="custom-price">מחיר ייקבע בהמשך</span>' : ''}
                    </div>
                    <input type="number" class="product-quantity" value="1" min="1" data-product-id="${productId}">
                </div>
            `);
        },

        displayProductInOrder: function(item) {
            const $container = $('#all-products-list');
            const $item = this.createProductItem({
                id: item.id,
                name: item.name,
                price: item.price,
                custom_price: item.price
            });
            $container.append($item);
        },

        updateOrderSummary: function() {
            const selectedItems = [];
            
            $('.product-checkbox:checked').each(function() {
                const $item = $(this).closest('.product-item');
                const productId = $item.data('product-id');
                const quantity = parseInt($item.find('.product-quantity').val()) || 1;
                
                // ניסיון לחלץ מחיר מותאם, אחרת מחיר רגיל
                let price = 0;
                const $customPrice = $item.find('.custom-price');
                if ($customPrice.length && $customPrice.text().includes('מחיר ללקוח')) {
                    price = parseFloat($customPrice.text().replace(/[^\d.]/g, '')) || 0;
                } else {
                    price = parseFloat($item.find('.product-price').text().replace(/[^\d.]/g, '')) || 0;
                }

                selectedItems.push({
                    id: productId,
                    quantity: quantity,
                    price: price
                });
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

            // איסוף הפריטים שנבחרו
            this.orderItems = [];
            $('.product-checkbox:checked').each(function() {
                const $item = $(this).closest('.product-item');
                const productId = $item.data('product-id');
                const quantity = parseInt($item.find('.product-quantity').val()) || 1;
                
                // ניסיון לחלץ מחיר מותאם, אחרת מחיר רגיל
                let price = 0;
                const $customPrice = $item.find('.custom-price');
                if ($customPrice.length && $customPrice.text().includes('מחיר ללקוח')) {
                    price = parseFloat($customPrice.text().replace(/[^\d.]/g, '')) || 0;
                } else {
                    price = parseFloat($item.find('.product-price').text().replace(/[^\d.]/g, '')) || 0;
                }

                this.orderItems.push({
                    id: productId,
                    name: $item.find('strong').text(),
                    quantity: quantity,
                    price: price
                });
            }.bind(this));

            if (this.orderItems.length === 0) {
                this.showNotification('יש לבחור לפחות מוצר אחד', 'error');
                return;
            }

            // הצגת מסך סיכום
            this.displayCheckoutItems();
            this.showScreen('checkout');
        },

        displayCheckoutItems: function() {
            const $container = $('#checkout-items');
            $container.empty();

            let total = 0;

            this.orderItems.forEach((item) => {
                const itemTotal = item.price * item.quantity;
                total += itemTotal;

                const $row = $(`
                    <tr data-product-id="${item.id}">
                        <td>${item.name}</td>
                        <td>
                            <input type="number" class="edit-price" value="${item.price.toFixed(2)}" step="0.01" min="0">
                        </td>
                        <td>
                            <input type="number" class="edit-quantity" value="${item.quantity}" min="1">
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
            $('#checkout-items tr').each(function() {
                const $row = $(this);
                updatedItems.push({
                    id: $row.data('product-id'),
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

            // שליחת בקשה ליצירת הזמנה
            $.ajax({
                url: kfirAgentData.ajaxurl,
                type: 'POST',
                data: {
                    action: 'kfir_agent_create_order',
                    nonce: kfirAgentData.nonce,
                    customer_id: this.selectedCustomer.id,
                    items: updatedItems,
                    payment_method: paymentMethod
                },
                success: (response) => {
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

            $.ajax({
                url: kfirAgentData.ajaxurl,
                type: 'POST',
                data: formData,
                processData: false,
                contentType: false,
                success: (response) => {
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
        }
    };

    $(document).ready(function() {
        KfirAgent.init();
    });

})(jQuery);
