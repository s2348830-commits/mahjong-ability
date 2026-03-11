// public/client.js
(function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', () => {
        console.log("Initializing Mahjong Ability Client...");

        // 1. 各モジュールのインスタンス化
        const network = new window.NetworkManager();
        const ui = new window.UIManager();
        const renderer = new window.MahjongRenderer('game-canvas');
        
        // UI操作が必要な部分はロビーマネージャー等にUI参照を渡す（必要に応じて）
        const lobby = window.LobbyManager ? new window.LobbyManager(network) : null;
        
        // カードエディタの初期化 (DOM構築とイベントバインド)
        const cardEditor = window.CardEditor ? new window.CardEditor() : null;

        // グローバルな状態管理
        let myPlayerId = null;
        let currentGameState = null;

        // 2. サーバーへの接続
        network.connect();

        // 3. サーバーからのイベントハンドリング（イベント駆動）
        
        // 部屋の状態が更新されたとき（入退室、準備完了など）
        network.callbacks = network.callbacks || new Map(); // 安全のための初期化確認
        
        const originalHandleMessage = network.handleMessage.bind(network);
        network.handleMessage = (data) => {
            originalHandleMessage(data);

            if (data.type === 'EVENT_ROOM_STATE_SYNC') {
                if (lobby && lobby.updateRoomUI) {
                    lobby.updateRoomUI(data.payload);
                }
            }

            // ゲーム状態の更新を受信したとき（毎ターン、打牌ごと）
            if (data.type === 'EVENT_GAME_STATE_UPDATE') {
                currentGameState = data.payload;
                
                // 自分のIDが未取得なら gameState から取得を試みる
                if (!myPlayerId && lobby) {
                    myPlayerId = lobby.myId; // lobby側でログイン時に保持しているID
                }

                // 画面をゲームビューに切り替え
                ui.switchView('game');
                
                // 描画エンジンに最新状態を渡して再描画
                renderer.render(currentGameState, myPlayerId);

                // レースコンディション対策：WAIT_ACTION（鳴き・カード待機フェーズ）のUI処理
                if (currentGameState.status === 'WAIT_ACTION') {
                    ui.toggleSkipButton(true, () => {
                        network.sendRequest('ACTION', { actionType: 'SKIP' });
                    });
                } else {
                    ui.toggleSkipButton(false);
                }

                // 手牌のクリックイベント（打牌）の再バインド
                bindDiscardEvent(currentGameState);
            }

            // ゲーム内のアナウンス（ロン、ポン、カード発動など）
            if (data.type === 'EVENT_GAME_ANNOUNCEMENT') {
                const eventData = data.payload;
                console.log("Game Announcement:", eventData);
                // TODO: 画面上に「ロン！」「カード発動！」などのエフェクトを描画する
                if (eventData.type === 'RON') {
                    alert(`ロン！ プレイヤー ${eventData.playerId} があがりました！`);
                }
            }
        };

        // 4. キャンバスのクリック（打牌アクション）の処理
        function bindDiscardEvent(gameState) {
            const canvas = document.getElementById('game-canvas');
            if (!canvas) return;

            // 既存のイベントリスナーを破棄するためにクローンして置換するハック（簡易的）
            const newCanvas = canvas.cloneNode(true);
            canvas.parentNode.replaceChild(newCanvas, canvas);
            
            // Rendererのコンテキストを取り直す
            renderer.canvas = newCanvas;
            renderer.ctx = newCanvas.getContext('2d');

            const me = gameState.players.find(p => p.id === myPlayerId);
            if (!me) return;

            ui.bindCanvasClick(newCanvas, me.hand.length, (tileIndex) => {
                // 自分のターンで、かつプレイ中の場合のみ打牌可能
                if (gameState.status === 'PLAYING' && gameState.currentTurn === myPlayerId) {
                    const tileToDiscard = me.hand[tileIndex];
                    if (tileToDiscard) {
                        console.log("Discarding:", tileToDiscard);
                        network.sendRequest('ACTION', { 
                            actionType: 'DISCARD', 
                            payload: { tile: tileToDiscard } 
                        });
                    }
                }
            });
        }

        // --- 以下、サーバーへの初期接続時のモックログイン処理 ---
        // 実際の運用では認証システム（JWTやSession）と連携します
        setTimeout(() => {
            network.sendRequest('LOGIN', { name: "Player_" + Math.floor(Math.random()*1000) })
                .then(res => {
                    myPlayerId = res.myId;
                    if(lobby) lobby.myId = myPlayerId;
                    console.log("Logged in as:", myPlayerId);
                    // ロビー画面の更新
                    if(lobby) lobby.fetchRooms();
                })
                .catch(err => console.error("Login failed", err));
        }, 500); // 接続完了を少し待つ
    });

})();