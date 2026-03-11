// public/ui.js
(function(global) {
    'use strict';

    class UIManager {
        constructor() {
            this.views = {
                lobby: document.getElementById('lobby-view'),
                room: document.getElementById('room-view'),
                game: document.getElementById('game-view')
            };
            this.editorModal = document.getElementById('card-editor-modal');
            this.btnOpenEditor = document.getElementById('btn-open-editor');
            this.btnCloseEditor = document.getElementById('btn-close-editor');
            this.btnSkip = document.getElementById('btn-skip-action');
            
            this.bindEvents();
        }

        bindEvents() {
            if (this.btnOpenEditor) {
                this.btnOpenEditor.addEventListener('click', () => {
                    this.editorModal.style.display = 'block';
                });
            }
            if (this.btnCloseEditor) {
                this.btnCloseEditor.addEventListener('click', () => {
                    this.editorModal.style.display = 'none';
                });
            }
        }

        switchView(viewName) {
            Object.values(this.views).forEach(el => {
                if (el) el.classList.remove('active');
            });
            if (this.views[viewName]) {
                this.views[viewName].classList.add('active');
            }
        }

        toggleSkipButton(show, callback) {
            if (!this.btnSkip) return;
            this.btnSkip.style.display = show ? 'inline-block' : 'none';
            if (show && callback) {
                this.btnSkip.onclick = () => {
                    callback();
                    this.btnSkip.style.display = 'none';
                };
            }
        }

        /**
         * キャンバス上のクリック/タップ座標から、自分の手牌のインデックスを計算する
         * （スマホのタップ反応を高速化）
         */
        bindCanvasClick(canvas, myHandLength, callback) {
            const handleInput = (event) => {
                event.preventDefault(); // タップ時のズームやスクロールなどの誤作動を防止

                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                
                // PCのマウスクリックか、スマホのタッチかで座標の取り方を変える
                let clientX, clientY;
                if (event.type === 'touchstart') {
                    clientX = event.changedTouches[0].clientX;
                    clientY = event.changedTouches[0].clientY;
                } else {
                    clientX = event.clientX;
                    clientY = event.clientY;
                }

                const x = (clientX - rect.left) * scaleX;
                const y = (clientY - rect.top) * scaleY;

                // 描画ロジックに基づく自分の手牌の当たり判定エリア計算
                const cx = canvas.width / 2;
                const cy = canvas.height / 2;
                const bottomY = cy + (canvas.height / 2 - 20) - 45; // tileHeight = 45

                const tileWidth = 30;
                const startX = cx - ((myHandLength * tileWidth) / 2);

                // Y座標が手牌の高さの範囲内かチェック
                if (y >= bottomY && y <= bottomY + 45) {
                    // X座標から何番目の牌をクリックしたか計算
                    if (x >= startX && x <= startX + (myHandLength * tileWidth)) {
                        const tileIndex = Math.floor((x - startX) / tileWidth);
                        callback(tileIndex);
                    }
                }
            };

            // クリックとタッチの両方に対応させる
            canvas.addEventListener('click', handleInput);
            canvas.addEventListener('touchstart', handleInput, { passive: false });
        }
    }

    global.UIManager = UIManager;

})(typeof window !== 'undefined' ? window : this);