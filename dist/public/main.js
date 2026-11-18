// main.js
// 縮略圖淡入：每張圖在同一個「生命週期」內只淡入一次。
// 重點：隱藏（opacity -> 0）必須是「瞬間」的，不能套用 transition，
// 否則不論是自己重新處理、還是加速插件把 opacity 還原成 ''，
// 都會多跑一次 600ms 的淡出/淡入，看起來就是「漸變兩次」。
(function () {
    'use strict';

    // 從 HFS 獲取配置，如果沒有則使用默認值
    const config = (window.HFS && HFS.getPluginConfig) ? HFS.getPluginConfig() : {}

    const CONFIG = {
        duration: clamp(Number(config.duration), 600, 100, 2000),
        delay: clamp(Number(config.delay), 300, 0, 1000)
    }

    // 加速類插件（Stop-images-on-navigate / Videos-player+ / MVfiles-covers …）
    // 在視口外會拿走 src 並加上這些 class；回來時會把 src 還原，
    // 同時清掉 data-fade-processed 和 inline opacity。
    // 我們必須在「class 被移除」的那個 microtask（同一個 frame、尚未 paint）
    // 立刻把圖藏起來，否則它會先以 opacity:1 露出一次，然後才被本插件重新淡入。
    const SUSPEND_CLASSES = ['scroll-suspended', 'thumbnail-suspended']
    const THUMB_SELECTOR = 'img.icon.thumbnail'

    // 每張圖的淡入狀態：gen 用來讓舊的 timer / rAF 自動作廢
    const STATE = new WeakMap()
    let scanQueued = false

    function clamp(v, def, min, max) {
        if (!Number.isFinite(v)) v = def
        return Math.min(max, Math.max(min, v))
    }

    function isThumb(el) {
        return !!el && el.nodeType === 1 && el.tagName === 'IMG' &&
            el.classList.contains('thumbnail') && el.classList.contains('icon')
    }

    function hasSuspendClass(classStr) {
        if (!classStr) return false
        const list = classStr.split(/\s+/)
        for (const c of SUSPEND_CLASSES) if (list.includes(c)) return true
        return false
    }

    function isSuspended(img) {
        for (const c of SUSPEND_CLASSES) if (img.classList.contains(c)) return true
        return false
    }

    function stateOf(img) {
        let s = STATE.get(img)
        if (!s) {
            s = { gen: 0, timer: 0, waiting: false, shown: false, pending: false, revealAt: 0 }
            STATE.set(img, s)
        }
        return s
    }

    // 作廢這張圖所有排程中的動作
    function cancel(img) {
        const s = stateOf(img)
        s.gen++
        if (s.timer) {
            clearTimeout(s.timer)
            s.timer = 0
        }
        s.waiting = false
        s.pending = false
        return s
    }

    // 頁面上常有 `body.orange-low-perf * { transition: none !important }` 之類的全域規則
    // （Orange 主題低效能模式、Frontend-performance-optimizer 的 accelerated-mode）。
    // inline transition 壓不過 !important，所以淡入時改用 specificity 更高的 class 規則。
    function ensureStyles() {
        if (document.getElementById('fade-thumbnail-style')) return
        const style = document.createElement('style')
        style.id = 'fade-thumbnail-style'
        style.textContent =
            `img.icon.thumbnail.fade-animating{transition:opacity ${CONFIG.duration}ms ease-in-out !important;}`
        document.head.appendChild(style)
    }

    // 瞬間隱藏：沒有 transition 就不會產生「淡出」動畫
    function hideInstant(img) {
        img.classList.remove('fade-animating')
        img.style.transition = 'none'
        img.style.opacity = '0'
    }

    // 圖片是否已經開始露出（給「掛起」時判斷要不要在恢復後重播淡入用）
    // 注意：不能用 getComputedStyle 判斷，因為加速插件會用
    // `img.scroll-suspended { opacity: 0 !important }` 把圖藏起來，
    // 那會讓「已經顯示過」的圖被誤判成「還沒淡入完成」。
    function revealAge(img) {
        const s = stateOf(img)
        return s.revealAt ? (performance.now() - s.revealAt) : -1
    }

    // 開始（或重新開始）一張圖的淡入
    function startFade(img) {
        if (!isThumb(img) || !img.isConnected || isSuspended(img)) return

        const s = cancel(img)
        const gen = s.gen
        s.shown = false
        s.pending = true
        s.revealAt = 0
        img.dataset.fadeProcessed = 'true'
        hideInstant(img)

        const begin = () => {
            // 期間若被 suspend / 重新排程 / 移除，就交給新的 gen 處理
            if (gen !== s.gen || !img.isConnected || isSuspended(img)) return
            if (!(img.complete && img.naturalWidth > 0)) {
                s.waiting = true   // 等 load 事件再呼叫 startFade
                return
            }
            s.waiting = false

            // 隨機延時：避免整片縮略圖同時閃現
            s.timer = setTimeout(() => {
                s.timer = 0
                if (gen !== s.gen || !img.isConnected || isSuspended(img)) return
                if (!(img.complete && img.naturalWidth > 0)) {
                    s.waiting = true
                    return
                }

                img.style.transition = 'none'
                img.classList.add('fade-animating')
                // 兩個 rAF：確保 opacity:0 已經真正應用到畫面上，transition 才會從 0 開始
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    if (gen !== s.gen || !img.isConnected || isSuspended(img)) return
                    s.revealAt = performance.now()
                    img.style.opacity = '1'

                    // 動畫結束後把 transition 拿掉：之後任何插件把 opacity 設成 '' 或 0
                    // 都會是「瞬間」變化，不會再觸發一次莫名其妙的淡入。
                    s.timer = setTimeout(() => {
                        s.timer = 0
                        if (gen !== s.gen) return
                        s.shown = true
                        s.pending = false
                        img.classList.remove('fade-animating')
                        img.style.transition = 'none'
                    }, CONFIG.duration + 100)
                }))
            }, Math.floor(Math.random() * (CONFIG.delay + 1)))
        }

        begin()
    }

    // 加速插件把圖掛起：停止 transition，避免它還原 opacity 時產生多餘動畫
    function onSuspended(img) {
        const s = stateOf(img)
        const age = revealAge(img)
        // 淡入其實已經跑得差不多了（例如完成 timer 還沒輪到就被掛起）：算「已顯示過」
        if (!s.shown && age >= CONFIG.duration * 0.6) s.shown = true
        cancel(img)
        img.classList.remove('fade-animating')
        img.style.transition = 'none'
    }

    // 加速插件把圖還原：同一 microtask 內先把圖藏好，再重新淡入
    function onResumed(img) {
        if (!isThumb(img) || !img.isConnected || isSuspended(img)) return

        const s = stateOf(img)
        if (s.shown) {
            // 已經完整顯示過的圖：直接顯示，不再重播淡入（這正是「淡入兩次」的來源）
            cancel(img)
            img.dataset.fadeProcessed = 'true'
            img.classList.remove('fade-animating')
            img.style.transition = 'none'
            img.style.opacity = '1'
            return
        }
        // 上次淡入還沒完成就被掛起（或根本還沒開始）：重新淡入一次
        startFade(img)
    }

    // src 被還原（有些插件不一定會補發 class 變更）
    function onSrcReady(img) {
        if (!img.getAttribute('src') || isSuspended(img)) return
        const s = STATE.get(img)
        if (!s) return            // 新節點交給掃描處理
        if (img.dataset.fadeProcessed !== 'true' || s.waiting) startFade(img)
    }

    function processAll() {
        scanQueued = false
        const images = document.querySelectorAll(THUMB_SELECTOR)
        for (const img of images) {
            if (isSuspended(img)) continue
            const s = STATE.get(img)
            if (img.dataset.fadeProcessed === 'true') {
                // 標記還在但圖是藏著的（例如計時器被瀏覽器凍結/還原）：補一次
                if (!s || (!s.shown && !s.pending)) startFade(img)
                continue
            }
            startFade(img)
        }
    }

    function scheduleScan() {
        if (scanQueued) return
        scanQueued = true
        requestAnimationFrame(processAll)
    }

    function init() {
        ensureStyles()
        processAll()

        // DOM 變化：新增的圖、被掛起/還原的 class、被還原的 src
        const observer = new MutationObserver(records => {
            let needScan = false
            for (const r of records) {
                if (r.type === 'childList') {
                    if (r.addedNodes && r.addedNodes.length) needScan = true
                    continue
                }
                const img = r.target
                if (!isThumb(img)) continue

                if (r.attributeName === 'class') {
                    const was = hasSuspendClass(r.oldValue)
                    const now = hasSuspendClass(img.className)
                    if (was && !now) onResumed(img)
                    else if (!was && now) onSuspended(img)
                } else if (r.attributeName === 'src') {
                    onSrcReady(img)
                }
            }
            if (needScan) scheduleScan()
        })
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeOldValue: true,
            attributeFilter: ['class', 'src']
        })

        // HFS 重繪清單
        if (window.HFS && HFS.onEvent) {
            HFS.onEvent('afterList', () => {
                setTimeout(scheduleScan, 50)
                setTimeout(scheduleScan, 300)
            })
        }

        // 滾動：處理「已載入但還沒輪到」的圖（lazy loading）
        let scrollTimer
        document.addEventListener('scroll', () => {
            clearTimeout(scrollTimer)
            scrollTimer = setTimeout(scheduleScan, 150)
        }, { passive: true })

        // 圖片載入完成（capture：img 的 load 不會冒泡）
        document.addEventListener('load', ev => {
            const img = ev.target
            if (!isThumb(img)) return
            const s = STATE.get(img)
            if (!s || !s.waiting) return
            if (img.dataset.fadeProcessed !== 'true' || isSuspended(img)) return
            startFade(img)
        }, true)

        // 載入失敗（例如 ?get=thumb 失敗）：直接顯示，thumbnails 插件會換成預設圖示
        document.addEventListener('error', ev => {
            const img = ev.target
            if (!isThumb(img)) return
            const s = STATE.get(img)
            if (!s || img.dataset.fadeProcessed !== 'true') return
            cancel(img)
            img.classList.remove('fade-animating')
            img.style.transition = 'none'
            img.style.opacity = '1'
            s.shown = true
        }, true)

        // 暴露手動觸發函數（便於調試）
        window.thumbnailFade = {
            process: processAll,
            config: CONFIG
        }
    }

    // 等待 DOM 加載
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init)
    } else {
        init()
    }

})();
