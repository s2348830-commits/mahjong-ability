/**
 * public/client.js
 * クライアント全体のエントリーポイント。
 * 通信、UI、描画、エディタの各モジュールを統合・管理する。
 */

// 各モジュールは既にグローバル(window)に登録されている、
// もしくはES6形式でエクスポートされていることを前提としています。

export class ClientApp {
    constructor() {
        // 各モジュールのインスタンス化
        this.network = new window.Network();
        this.ui = new window.UIManager();
        this.renderer = new window.MahjongRenderer('game-canvas');
        this.cardEditor = new window.CardEditor();
        
        // ロビー・部屋管理の統合 (ui.jsやlobby.jsと連携)
        this.lobby = window.LobbyManager ? new window.LobbyManager(this.network) : null;
        
        this.myId = null;
        this.gameState = null;
    }

    /**
     * アプリケーションの起動
     */
    start() {
        console.log('[ClientApp] Starting application...');
        
        // イベント購読の登録
        this.registerNetworkEvents();
        this.registerUIEvents();
        
        // WebSocket接続開始
        this.network.connect();
    }

    /**
     * サーバーからのネットワークイベントを登録
     */
    registerNetworkEvents() {
        // 接続完了時
        this.network.on('connected', () => {
            console.log('[ClientApp] Connected to server. Logging in...');
            // 初期ログイン処理
            const tempName = `Player_${Math.floor(Math.random() * 1000)}`;
            this.network.send('LOGIN', { name: tempName });
        });

        // ログイン成功時
        this.network.on('LOGIN_ACK', (data) => {
            if (data) {
                this.myId = data.myId;
                if (this.lobby) this.lobby.myId = this.myId;
                console.log(`[ClientApp] Logged in with ID: ${this.myId}`);
                // 初期ロビー情報の取得
                this.network.send('FETCH_ROOMS');
            }
        });

        // 部屋情報の更新
        this.network.on('EVENT_ROOM_STATE_SYNC', (roomData) => {
            console.log('[ClientApp] Room updated:', roomData);
            if (this.lobby) {
                this.lobby.updateRoomUI(roomData);
            }
        });

        // ゲーム状態の更新 (麻雀卓の描画)
        this.network.on('EVENT_GAME_STATE_UPDATE', (state) => {
            this.gameState = state;
            this.ui.switchView('game');
            this.renderer.render(state, this.myId);
            
            // 自分の手番なら牌のクリックを有効化
            if (state.status === 'PLAYING' && state.currentTurn === this.myId) {
                this.bindDiscardAction();
            }

            // 特殊アクション(鳴き・ロン)の待機状態ならスキップボタン表示
            if (state.status === 'WAIT_ACTION') {
                this.ui.toggleSkipButton(true, () => {
                    this.network.send('ACTION', { actionType: 'SKIP' });
                });
            } else {
                this.ui.toggleSkipButton(false);
            }
        });

        // ゲーム内アナウンス (和了、カード発動など)
        this.network.on('EVENT_GAME_ANNOUNCEMENT', (announcement) => {
            console.log('[ClientApp] Announcement:', announcement);
            if (announcement.type === 'WIN') {
                alert(`和了！ ${announcement.winType}: ${announcement.playerId}`);
            }
        });
    }

    /**
     * UIからの操作イベントを登録
     */
    registerUIEvents() {
        // カードエディタからの保存リクエスト
        window.addEventListener('saveCardRequest', (e) => {
            const cardData = e.detail;
            console.log('[ClientApp] Equipping card:', cardData);
            this.network.send('EQUIP_CARD', { card: cardData });
        });

        // 各種UIボタンの操作 (LobbyManager等に委譲されている場合はそちらで処理)
        // 必要に応じてここに直接的なネットワーク送信を追加可能
    }

    /**
     * 手牌のクリックによる打牌処理のバインド
     */
    bindDiscardAction() {
        const canvas = document.getElementById('game-canvas');
        if (!canvas || !this.gameState) return;

        const myData = this.gameState.players.find(p => p.id === this.myId);
        if (!myData) return;

        // UIモジュールを使用して牌のクリックインデックスを取得
        this.ui.bindCanvasClick(canvas, myData.hand.length, (tileIndex) => {
            const tile = myData.hand[tileIndex];
            if (tile) {
                this.network.send('ACTION', {
                    actionType: 'DISCARD',
                    payload: { tile: tile }
                });
            }
        });
    }
}

/**
 * 起動処理
 */
window.onload = () => {
    const app = new ClientApp();
    app.start();
};