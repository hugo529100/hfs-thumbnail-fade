// main.js
(function() {
    'use strict';
    
    // 從 HFS 獲取配置，如果沒有則使用默認值
    const config = (window.HFS && HFS.getPluginConfig) ? HFS.getPluginConfig() : {}
    
    const CONFIG = {
        duration: config.duration || 600,
        delay: config.delay || 300
    };

    // 獲取隨機延時
    function getRandomDelay() {
        return Math.floor(Math.random() * CONFIG.delay);
    }

    // 處理單個圖片
    function processImage(img) {
        if (img.dataset.fadeProcessed === 'true') return;
        img.dataset.fadeProcessed = 'true';

        // 設置透明和過渡
        img.style.transition = `opacity ${CONFIG.duration}ms ease-in-out`;
        img.style.opacity = '0';

        // 顯示圖片的函數
        function showImage() {
            img.style.opacity = '1';
        }

        // 如果圖片已加載完成
        if (img.complete && img.naturalWidth > 0) {
            setTimeout(showImage, getRandomDelay());
        } else {
            // 監聽加載事件
            img.addEventListener('load', function onLoad() {
                setTimeout(showImage, getRandomDelay());
                this.removeEventListener('load', onLoad);
            });
            
            // 錯誤時也顯示
            img.addEventListener('error', function onError() {
                showImage();
                this.removeEventListener('error', onError);
            });
        }
    }

    // 處理所有縮略圖
    function processAllThumbnails() {
        const images = document.querySelectorAll('img.icon.thumbnail:not([data-fade-processed="true"])');
        images.forEach(processImage);
    }

    // 添加全局樣式
    function addStyles() {
        const styleId = 'fade-thumbnail-style';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                img.icon.thumbnail {
                    transition: opacity ${CONFIG.duration}ms ease-in-out !important;
                }
            `;
            document.head.appendChild(style);
        }
    }

    // 主函數
    function init() {
        addStyles();

        // 首次處理
        processAllThumbnails();

        // 多次嘗試（應對動態加載）
        const delays = [100, 300, 500, 800, 1200, 2000];
        delays.forEach(delay => {
            setTimeout(processAllThumbnails, delay);
        });

        // 監聽DOM變化
        const observer = new MutationObserver(() => {
            processAllThumbnails();
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // 監聽HFS事件
        if (window.HFS && HFS.onEvent) {
            HFS.onEvent('afterList', () => {
                setTimeout(processAllThumbnails, 50);
                setTimeout(processAllThumbnails, 200);
                setTimeout(processAllThumbnails, 500);
            });
        }

        // 監聽滾動（懶加載）
        let scrollTimeout;
        document.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(processAllThumbnails, 200);
        }, { passive: true });

        // 暴露手動觸發函數（便於調試）
        window.thumbnailFade = {
            process: processAllThumbnails,
            config: CONFIG
        };

        console.log(`[縮略圖淡入] 已啟用 (持續時間: ${CONFIG.duration}ms, 延時: ${CONFIG.delay}ms)`);
    }

    // 等待DOM加載
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();