(function($){
    // Utility functions
    function showLoading($element) {
        $element.addClass('kfir-loading');
    }
    
    function hideLoading($element) {
        $element.removeClass('kfir-loading');
    }
    
    function showSuccess($element) {
        $element.addClass('kfir-success');
        setTimeout(() => $element.removeClass('kfir-success'), 600);
    }
    
    function animateRow($row) {
        $row.hide().fadeIn(400).css({
            'transform': 'translateX(20px)',
            'opacity': 0
        }).animate({
            'transform': 'translateX(0)',
            'opacity': 1
        }, 300);
    }
    
    function showNotification(message, type = 'success') {
        const $notification = $(`
            <div class="kfir-notification kfir-notification-${type}" style="
                position: fixed;
                top: 20px;
                right: 20px;
                background: ${type === 'success' ? 'linear-gradient(135deg, #28a745, #20c997)' : 'linear-gradient(135deg, #dc3545, #c82333)'};
                color: white;
                padding: 15px 25px;
                border-radius: 12px;
                box-shadow: 0 8px 25px rgba(0,0,0,0.15);
                z-index: 9999;
                transform: translateX(100%);
                transition: all 0.3s ease;
                font-weight: 600;
                font-size: 14px;
            ">
                ${message}
            </div>
        `);
        
        $('body').append($notification);
        
        setTimeout(() => {
            $notification.css('transform', 'translateX(0)');
        }, 100);
        
        setTimeout(() => {
            $notification.css('transform', 'translateX(100%)');
            setTimeout(() => $notification.remove(), 300);
        }, 3000);
    }

    function initSelect($el, action){
        $el.selectWoo({
            width: 'resolve',
            placeholder: $el.data('placeholder') || '',
            minimumInputLength: 0,
            ajax: {
                delay: 250,
                url: KFIR_CP.ajax,
                dataType: 'json',
                data: function(params){
                    return {
                        action: action,
                        nonce: KFIR_CP.nonce,
                        q: params.term || ''
                    };
                },
                processResults: function(data){
                    return data && data.results ? data : { results: [] };
                }
            }
        });
        
        // Add custom styling to select2 dropdown
        $el.on('select2:open', function() {
            setTimeout(() => {
                $('.select2-dropdown').addClass('kfir-select2-dropdown');
                $('.select2-results__option').addClass('kfir-select2-option');
            }, 10);
        });
    }
  
    function rowTemplate(item){
        const varTxt = item.attrs ? '<div class="kfir-variation">' + item.attrs + '</div>' : '';
        return `
            <tr data-id="${item.id}" style="opacity: 0; transform: translateY(20px);">
                <td>
                    <strong>${item.name || ''}</strong>
                    ${varTxt}
                </td>
                <td>
                    <span class="kfir-pill">#${item.id}</span>
                </td>
                <td>
                    <input type="text" 
                           class="regular-text kfir-price" 
                           value="${item.price || ''}" 
                           placeholder="0.00"
                           style="transition: all 0.3s ease;" />
                </td>
                <td>
                    <button class="kfir-remove" style="transition: all 0.3s ease;">
                        <span style="display: inline-block; transform: rotate(0deg); transition: transform 0.3s ease;">✕</span>
                    </button>
                </td>
            </tr>
        `;
    }
  
    $(function(){
        const $user = $('#kfir-user');
        const $prod = $('#kfir-product');
        const $rows = $('#kfir-rows');
        const $loadBtn = $('#kfir-load-user');
        const $addBtn = $('#kfir-add-product');
        const $saveBtn = $('#kfir-save');
        const $clearBtn = $('#kfir-clear-all');
        const $countDisplay = $('#kfir-products-count');

        // Function to update product count
        function updateProductCount() {
            const count = $rows.find('tr:not(.kfir-empty-state)').length;
            $countDisplay.text(`${count} מוצרים`);
        }

        // Initialize selects with enhanced styling
        initSelect($user, 'kfir_search_users');
        initSelect($prod, 'kfir_search_products');

        // Enhanced load user prices with loading animation
        $loadBtn.on('click', function(){
            const uid = $user.val();
            if (!uid) { 
                showNotification('בחר/י לקוח', 'error');
                return; 
            }

            showLoading($loadBtn);
            $loadBtn.text('טוען...');

            $.post(KFIR_CP.ajax, {
                action: 'kfir_get_user_prices',
                nonce: KFIR_CP.nonce,
                user_id: uid
            }, function(res){
                hideLoading($loadBtn);
                $loadBtn.text('טען מחירי לקוח');
                
                $rows.empty();
                if (res && res.success && res.data && res.data.rows) {
                    if (res.data.rows.length === 0) {
                        $rows.append(`
                            <tr class="kfir-empty-state">
                                <td colspan="4">
                                    <div class="kfir-empty-state">
                                        <p>לא נמצאו מחירים מותאמים ללקוח זה</p>
                                        <p>הוסף מוצרים כדי להתחיל</p>
                                    </div>
                                </td>
                            </tr>
                        `);
                    } else {
                        res.data.rows.forEach(function(r, index){
                            const $newRow = $(rowTemplate(r));
                            $rows.append($newRow);
                            
                            // Staggered animation for rows
                            setTimeout(() => {
                                $newRow.animate({
                                    opacity: 1,
                                    transform: 'translateY(0)'
                                }, 300);
                            }, index * 100);
                        });
                        
                        showNotification(`נטענו ${res.data.rows.length} מוצרים בהצלחה`);
                    }
                }
                updateProductCount();
            }).fail(function() {
                hideLoading($loadBtn);
                $loadBtn.text('טען מחירי לקוח');
                showNotification('שגיאה בטעינת המחירים', 'error');
            });
        });

        // Enhanced add product with animation
        $addBtn.on('click', function(){
            const id = $prod.val();
            const text = $prod.find('option:selected').text();

            if (!id) { 
                showNotification('בחר/י מוצר', 'error');
                return; 
            }

            // Prevent duplicates with visual feedback
            if ($rows.find('tr[data-id="'+ id +'"]').length) {
                const $existingRow = $rows.find('tr[data-id="'+ id +'"]');
                $existingRow.addClass('kfir-duplicate-warning');
                setTimeout(() => $existingRow.removeClass('kfir-duplicate-warning'), 1000);
                showNotification('המוצר כבר קיים ברשימה', 'error');
                return;
            }

            const $newRow = $(rowTemplate({ id: id, name: text, attrs: '', price: '' }));
            $rows.append($newRow);
            
            // Animate new row
            setTimeout(() => {
                $newRow.animate({
                    opacity: 1,
                    transform: 'translateY(0)'
                }, 300);
            }, 100);
            
            // Clear selection
            $prod.val(null).trigger('change');
            
            // Remove empty state if exists
            $rows.find('.kfir-empty-state').remove();
            
            updateProductCount();
            showNotification('המוצר נוסף בהצלחה');
        });

        // Enhanced remove row with animation
        $rows.on('click', '.kfir-remove', function(e){
            e.preventDefault();
            const $row = $(this).closest('tr');
            const $button = $(this);
            
            // Animate button
            $button.find('span').css('transform', 'rotate(180deg)');
            
            // Animate row removal
            $row.animate({
                opacity: 0,
                transform: 'translateX(100px)'
            }, 300, function() {
                $row.remove();
                
                // Check if no rows left and show empty state
                if ($rows.find('tr:not(.kfir-empty-state)').length === 0) {
                    $rows.append(`
                        <tr class="kfir-empty-state">
                            <td colspan="4">
                                <div class="kfir-empty-state">
                                    <p>לא נבחרו מוצרים עדיין</p>
                                    <p>בחר/י מוצר מהרשימה למעלה כדי להתחיל</p>
                                </div>
                            </td>
                        </tr>
                    `);
                }
                
                updateProductCount();
            });
        });

        // Enhanced save with loading and success animation
        $saveBtn.on('click', function(){
            const uid = $user.val();
            if (!uid) { 
                showNotification('בחר/י לקוח', 'error');
                return; 
            }

            const payload = [];
            $rows.find('tr').each(function(){
                const id = $(this).data('id');
                const price = $(this).find('.kfir-price').val();
                payload.push({ id: id, price: price });
            });

            if (payload.length === 0) {
                showNotification('אין מוצרים לשמירה', 'error');
                return;
            }

            showLoading($saveBtn);
            $saveBtn.text('שומר...');

            $.post(KFIR_CP.ajax, {
                action: 'kfir_save_user_prices',
                nonce: KFIR_CP.nonce,
                user_id: uid,
                rows: payload
            }, function(res){
                hideLoading($saveBtn);
                $saveBtn.text('שמור מחירים');
                
                if (res && res.success) {
                    showSuccess($saveBtn);
                    showNotification(`נשמרו ${payload.length} מחירים בהצלחה`);
                    
                    // Animate all rows with success effect
                    $rows.find('tr').each(function(index) {
                        const $row = $(this);
                        setTimeout(() => {
                            $row.addClass('kfir-success');
                            setTimeout(() => $row.removeClass('kfir-success'), 600);
                        }, index * 100);
                    });
                } else {
                    showNotification('שגיאה בשמירת המחירים', 'error');
                }
            }).fail(function() {
                hideLoading($saveBtn);
                $saveBtn.text('שמור מחירים');
                showNotification('שגיאה בשמירת המחירים', 'error');
            });
        });

        // Enhanced input interactions
        $rows.on('input', '.kfir-price', function() {
            const $input = $(this);
            const value = $input.val();
            
            // Add visual feedback for valid/invalid prices
            if (value && !isNaN(value) && parseFloat(value) >= 0) {
                $input.css({
                    'border-color': '#28a745',
                    'box-shadow': '0 0 0 3px rgba(40, 167, 69, 0.1)'
                });
            } else if (value && (isNaN(value) || parseFloat(value) < 0)) {
                $input.css({
                    'border-color': '#dc3545',
                    'box-shadow': '0 0 0 3px rgba(220, 53, 69, 0.1)'
                });
            } else {
                $input.css({
                    'border-color': '#e9ecef',
                    'box-shadow': 'none'
                });
            }
        });

        // Clear all products
        $clearBtn.on('click', function() {
            if ($rows.find('tr:not(.kfir-empty-state)').length === 0) {
                showNotification('הרשימה כבר ריקה', 'error');
                return;
            }
            
            if (confirm('האם אתה בטוח שברצונך לנקות את כל המוצרים מהרשימה?')) {
                $rows.find('tr:not(.kfir-empty-state)').each(function(index) {
                    const $row = $(this);
                    setTimeout(() => {
                        $row.animate({
                            opacity: 0,
                            transform: 'translateX(-100px)'
                        }, 200, function() {
                            $row.remove();
                        });
                    }, index * 50);
                });
                
                setTimeout(() => {
                    $rows.append(`
                        <tr class="kfir-empty-state">
                            <td colspan="4">
                                <div class="kfir-empty-state">
                                    <p>לא נבחרו מוצרים עדיין</p>
                                    <p>בחר/י מוצר מהרשימה למעלה כדי להתחיל</p>
                                </div>
                            </td>
                        </tr>
                    `);
                    updateProductCount();
                    showNotification('הרשימה נוקתה בהצלחה');
                }, 500);
            }
        });

        // Add hover effects for table rows
        $rows.on('mouseenter', 'tr', function() {
            $(this).css('transform', 'scale(1.02)');
        }).on('mouseleave', 'tr', function() {
            $(this).css('transform', 'scale(1)');
        });

        // Add CSS for additional animations
        $('<style>')
            .prop('type', 'text/css')
            .html(`
                .kfir-duplicate-warning {
                    animation: shake 0.5s ease-in-out;
                }
                
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
                
                .kfir-select2-dropdown {
                    border-radius: 12px !important;
                    box-shadow: 0 8px 25px rgba(0,0,0,0.15) !important;
                    border: 1px solid #e9ecef !important;
                }
                
                .kfir-select2-option {
                    padding: 10px 15px !important;
                    transition: all 0.2s ease !important;
                }
                
                				.kfir-select2-option:hover {
					background: linear-gradient(135deg, #3b82f6, #8b5cf6) !important;
					color: white !important;
				}
				
				.kfir-select2-option--highlighted {
					background: linear-gradient(135deg, #3b82f6, #8b5cf6) !important;
					color: white !important;
				}
            `)
            .appendTo('head');
    });
})(jQuery);