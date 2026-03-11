// server/gameManager.js
const MahjongEngine = require('./mahjongEngine');
const CardEngine = require('./cardEngine');

class GameManager {
    constructor(room, roomManager) {
        this.room = room;
        this.roomManager = roomManager;
        this.engine = new MahjongEngine();
        this.cardEngine = new CardEngine(this);

        this.gameState = {
            status: 'INIT', // INIT, PLAYING, WAIT_ACTION, ROUND_END
            round: 1,       // 東1局 = 1, 東2局 = 2...
            dealerIndex: 0, // 親（0~3）
            currentTurn: null, // 現在手番のplayerId
            players: [],    // { id, name, score, hand, melds, discards, isRiichi, cards }
            lastDiscard: null, // { playerId, tile }
        };

        this.actionQueue = []; // レースコンディション対策のアクションキュー
        this.actionTimer = null; // 鳴き/カード待機用タイマー
        
        this.initGame();
    }

    initGame() {
        // プレイヤー状態の初期化
        this.gameState.players = this.room.players.map((p, index) => ({
            id: p.id,
            name: p.name,
            score: 25000,
            seat: index, // 0:東, 1:南, 2:西, 3:北
            hand: [],
            melds: [], 
            discards: [],
            isRiichi: false,
            cards: p.equippedCards || [] // 【変更】装備した能力カードを引き継ぐ！
        }));

        this.startRound();
    }

    startRound() {
        this.engine.initializeWall();
        this.gameState.status = 'PLAYING';
        this.gameState.currentTurn = this.gameState.players[this.gameState.dealerIndex].id;
        this.gameState.lastDiscard = null;

        // 配牌 (4枚×3回 + 1枚)
        this.gameState.players.forEach(p => {
            p.hand = [];
            for (let i = 0; i < 13; i++) {
                p.hand.push(this.engine.drawTile());
            }
        });

        // 親の第一ツモ
        const dealer = this.gameState.players[this.gameState.dealerIndex];
        dealer.hand.push(this.engine.drawTile());

        this.broadcastGameState();
    }

    /**
     * クライアントからのアクションリクエストを受け取る窓口
     */
    handleAction(playerId, actionType, payload) {
        const player = this.gameState.players.find(p => p.id === playerId);
        if (!player) return;

        // 手番時の通常アクション
        if (this.gameState.status === 'PLAYING' && this.gameState.currentTurn === playerId) {
            if (actionType === 'DISCARD') {
                this.handleDiscard(playerId, payload.tile);
            } else if (actionType === 'TSUMO') {
                this.handleTsumo(playerId);
            } else if (actionType === 'PLAY_CARD') {
                this.handlePlayCardPhase(playerId, payload.card, { eventType: 'MY_TURN' });
            }
        } 
        // 誰かの打牌直後（鳴き・ロン・カードの待機時間中）
        else if (this.gameState.status === 'WAIT_ACTION') {
            this.queueAction(playerId, actionType, payload);
        }
    }

    handleDiscard(playerId, tile) {
        const player = this.gameState.players.find(p => p.id === playerId);
        
        // 手牌から該当牌を削除
        const tileIndex = player.hand.indexOf(tile);
        if (tileIndex > -1) {
            player.hand.splice(tileIndex, 1);
        } else {
            return; // 不正なリクエスト
        }

        player.discards.push({ tile, isRiichi: player.isRiichi });
        this.gameState.lastDiscard = { playerId, tile };
        
        // 鳴き・カード使用・ロンの待機フェーズへ移行（5秒待機）
        this.gameState.status = 'WAIT_ACTION';
        this.actionQueue = [];
        this.broadcastGameState();

        // 5秒後にキューを評価して処理を進める
        this.actionTimer = setTimeout(() => {
            this.resolveActionQueue();
        }, 5000);
    }

    /**
     * アクションをキューに追加（レースコンディション対策）
     */
    queueAction(playerId, actionType, payload) {
        // 同一プレイヤーの重複アクションは上書きするか弾く
        const existing = this.actionQueue.findIndex(a => a.playerId === playerId);
        if (existing > -1) this.actionQueue.splice(existing, 1);

        this.actionQueue.push({ playerId, actionType, payload });

        // 全員（捨てた人以外）からレスポンス（SKIP含む）が来たら、タイマーを待たずに即解決
        if (this.actionQueue.length === this.gameState.players.length - 1) {
            clearTimeout(this.actionTimer);
            this.resolveActionQueue();
        }
    }

    /**
     * アクションキューの優先順位を評価して実行する
     * 優先順位: 1.能力カード -> 2.ロン -> 3.ポン/カン -> 4.チー
     */
    resolveActionQueue() {
        // 優先度マッピング
        const priority = {
            'PLAY_CARD': 1,
            'RON': 2,
            'PON': 3,
            'KAN': 3,
            'CHII': 4,
            'SKIP': 99
        };

        // 優先度順にソート。優先度が同じ場合は、打牌者からの席順（上家・対面・下家）でロン優先などを決めるべきだが、ここでは単純ソート
        const sortedActions = this.actionQueue
            .filter(a => a.actionType !== 'SKIP')
            .sort((a, b) => priority[a.actionType] - priority[b.actionType]);

        if (sortedActions.length > 0) {
            const topAction = sortedActions[0];
            this.executeAction(topAction.playerId, topAction.actionType, topAction.payload);
        } else {
            // 誰も何もしなかった場合、次の人のターンへ
            this.nextTurn();
        }
    }

    executeAction(playerId, actionType, payload) {
        const targetDiscard = this.gameState.lastDiscard.tile;

        switch (actionType) {
            case 'PLAY_CARD':
                this.handlePlayCardPhase(playerId, payload.card, { eventType: 'DISCARD', targetPlayer: this.gameState.lastDiscard.playerId });
                this.nextTurn(); // カード処理後、通常の進行に戻す（カード効果次第で調整必要）
                break;
            case 'RON':
                // ロン処理（点数移動とゲーム終了フラグ）
                this.gameState.status = 'ROUND_END';
                this.broadcastGameEvent({ type: 'RON', playerId: playerId, fromId: this.gameState.lastDiscard.playerId });
                break;
            case 'PON':
                // TODO: 手牌から2枚抜き取り、副露に追加。現在手番をこのプレイヤーに変更
                this.changeTurn(playerId);
                break;
            case 'CHII':
                // TODO: 手牌から指定の2枚を抜き取り、副露に追加。現在手番をこのプレイヤーに変更
                this.changeTurn(playerId);
                break;
        }
    }

    changeTurn(playerId) {
        this.gameState.currentTurn = playerId;
        this.gameState.status = 'PLAYING';
        this.broadcastGameState();
    }

    nextTurn() {
        const currentIdx = this.gameState.players.findIndex(p => p.id === this.gameState.currentTurn);
        const nextIdx = (currentIdx + 1) % this.gameState.players.length;
        
        this.gameState.currentTurn = this.gameState.players[nextIdx].id;
        this.gameState.status = 'PLAYING';

        // 次のプレイヤーにツモさせる
        const nextPlayer = this.gameState.players[nextIdx];
        const drawnTile = this.engine.drawTile();
        
        if (!drawnTile) {
            // 流局
            this.gameState.status = 'ROUND_END';
            this.broadcastGameEvent({ type: 'RYUUKYOKU' });
        } else {
            nextPlayer.hand.push(drawnTile);
            this.broadcastGameState();
        }
    }

    handlePlayCardPhase(playerId, card, eventContext) {
        if (this.cardEngine.canPlayCard(playerId, card, eventContext)) {
            this.cardEngine.executeCardEffect(playerId, card, eventContext);
        }
    }

    /**
     * 部屋にいる全プレイヤーに、それぞれの視点のゲーム状態を送信する
     * （他人の手牌は隠す処理をここで行う）
     */
    broadcastGameState() {
        this.gameState.players.forEach(player => {
            // 自分以外のプレイヤーの手牌は伏せる安全なデータを生成（サーバー権威のチート対策）
            const safePlayersData = this.gameState.players.map(p => {
                if (p.id === player.id) {
                    return p; // 自分なら手牌を見せる
                } else {
                    return {
                        ...p,
                        hand: new Array(p.hand.length).fill('unknown') // 他人は伏せ牌
                    };
                }
            });

            const safeGameState = {
                ...this.gameState,
                players: safePlayersData,
                tilesLeft: this.engine.getTilesLeft(),
                doraIndicators: this.engine.doraIndicators
            };

            const eventPayload = JSON.stringify({
                type: 'EVENT_GAME_STATE_UPDATE',
                payload: safeGameState
            });

            if (player.ws && player.ws.readyState === 1) {
                player.ws.send(eventPayload);
            }
        });
    }

    broadcastGameEvent(eventData) {
        const eventPayload = JSON.stringify({
            type: 'EVENT_GAME_ANNOUNCEMENT',
            payload: eventData
        });
        this.room.players.forEach(p => {
            if (p.ws && p.ws.readyState === 1) {
                p.ws.send(eventPayload);
            }
        });
    }
}

module.exports = GameManager;