// public/mahjongRenderer.js
(function(global) {
    'use strict';

    class MahjongRenderer {
        constructor(canvasId) {
            this.canvas = document.getElementById(canvasId);
            if (!this.canvas) return;
            this.ctx = this.canvas.getContext('2d');
            this.resizeCanvas();
            window.addEventListener('resize', () => this.resizeCanvas());
        }

        resizeCanvas() {
            // 画面サイズに合わせて16:9を維持しつつ最大化（雀魂風レイアウト）
            const container = this.canvas.parentElement;
            this.canvas.width = container.clientWidth || 800;
            this.canvas.height = (this.canvas.width * 9) / 16;
        }

        /**
         * 毎フレーム（または状態更新時）の描画エントリポイント
         */
        render(gameState, myId) {
            if (!this.ctx) return;
            
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = '#1a4f2c'; // 麻雀マットの緑色
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            if (!gameState || !gameState.players) return;

            const myIndex = gameState.players.findIndex(p => p.id === myId);
            if (myIndex === -1) return; // 観戦モードなどは別途実装

            this.drawCenterInfo(gameState);
            
            // 4人のプレイヤーを自分の視点(下)を基準に回転させて描画
            for (let i = 0; i < 4; i++) {
                const playerIndex = (myIndex + i) % 4;
                const player = gameState.players[playerIndex];
                if (player) {
                    this.drawPlayer(player, i, gameState.currentTurn === player.id);
                }
            }
        }

        /**
         * 卓の中央情報（残り牌、ドラ表示、局数）
         */
        drawCenterInfo(gameState) {
            const cx = this.canvas.width / 2;
            const cy = this.canvas.height / 2;
            const size = 120;

            this.ctx.fillStyle = '#222';
            this.ctx.fillRect(cx - size/2, cy - size/2, size, size);

            this.ctx.fillStyle = '#fff';
            this.ctx.font = '16px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(`東 ${gameState.round} 局`, cx, cy - 20);
            this.ctx.fillText(`残り: ${gameState.tilesLeft || 0} 牌`, cx, cy + 5);

            // ドラ表示牌の描画（簡易テキスト）
            if (gameState.doraIndicators) {
                this.ctx.fillStyle = '#ffcc00';
                this.ctx.fillText(`ドラ: ${gameState.doraIndicators.join(' ')}`, cx, cy + 30);
            }
        }

        /**
         * 各プレイヤーの手牌と捨て牌の描画
         * relativePos: 0=自分(下), 1=下家(右), 2=対面(上), 3=上家(左)
         */
        drawPlayer(player, relativePos, isCurrentTurn) {
            this.ctx.save();
            
            // キャンバス中心を基準に回転させる
            this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
            this.ctx.rotate(relativePos * (Math.PI / 2));
            
            // 描画位置を画面下部に移動
            const bottomY = this.canvas.height / 2 - 20;
            
            // 手番ハイライト
            if (isCurrentTurn) {
                this.ctx.fillStyle = 'rgba(255, 255, 0, 0.2)';
                this.ctx.fillRect(-200, bottomY - 60, 400, 60);
            }

            // プレイヤー名と点数
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(`${player.name} : ${player.score}`, 0, bottomY - 70);

            // 手牌の描画
            const tileWidth = 30;
            const tileHeight = 45;
            const startX = -((player.hand.length * tileWidth) / 2);

            player.hand.forEach((tile, index) => {
                const tx = startX + (index * tileWidth);
                const ty = bottomY - tileHeight;

                this.ctx.fillStyle = tile === 'unknown' ? '#ccc' : '#fff'; // 他人の牌はグレー
                this.ctx.strokeStyle = '#000';
                this.ctx.lineWidth = 2;
                
                // 少し丸みのある四角形
                this.ctx.fillRect(tx, ty, tileWidth - 2, tileHeight);
                this.ctx.strokeRect(tx, ty, tileWidth - 2, tileHeight);

                // 自分の牌の中身を描画
                if (tile !== 'unknown') {
                    this.ctx.fillStyle = tile.includes('r') ? '#e74c3c' : '#000'; // 赤ドラ対応
                    this.ctx.font = '16px Arial';
                    // 簡易的に文字列を描画（本来は画像マッピング）
                    this.ctx.fillText(tile.replace('r', ''), tx + tileWidth/2 - 1, ty + 28);
                }
            });

            // 捨て牌の描画（6枚切りで3段のレイアウト）
            const discardStartX = -90;
            const discardStartY = -100;
            const dTileW = 20;
            const dTileH = 30;

            player.discards.forEach((discardObj, index) => {
                const row = Math.floor(index / 6);
                const col = index % 6;
                const dx = discardStartX + (col * dTileW);
                const dy = discardStartY + (row * dTileH);

                this.ctx.fillStyle = '#ddd';
                this.ctx.fillRect(dx, dy, dTileW - 1, dTileH - 1);
                this.ctx.strokeRect(dx, dy, dTileW - 1, dTileH - 1);

                this.ctx.fillStyle = discardObj.tile.includes('r') ? '#e74c3c' : '#333';
                this.ctx.font = '12px Arial';
                this.ctx.fillText(discardObj.tile.replace('r', ''), dx + dTileW/2, dy + 20);
            });

            this.ctx.restore();
        }
    }

    global.MahjongRenderer = MahjongRenderer;

})(typeof window !== 'undefined' ? window : this);