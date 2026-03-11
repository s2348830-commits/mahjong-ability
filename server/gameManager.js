/**
 * server/gameManager.js
 * 局の進行管理、アクション優先順位、能力カード連携を担うクラス
 */
const MahjongEngine = require('./mahjongEngine');
const CardEngine = require('./cardEngine');

class GameManager {
    /**
     * @param {Object} room - RoomManagerから渡される部屋情報
     * @param {Object} roomManager - RoomManagerのインスタンス
     */
    constructor(room, roomManager) {
        this.room = room;
        this.roomManager = roomManager;
        this.engine = new MahjongEngine();
        this.cardEngine = new CardEngine(this);

        // ゲームの内部状態
        this.gameState = {
            status: 'INIT',      // INIT, PLAYING, WAIT_ACTION, ROUND_END
            round: 1,            // 東1局=1, 東2局=2...
            dealerIndex: 0,      // 親のインデックス (0-3)
            currentTurn: null,   // 現在の手番プレイヤーID
            lastDiscard: null,   // { playerId, tile }
            players: [],         // プレイヤーごとの動的データ
            tilesLeft: 0
        };

        // 同時アクション処理用のキュー
        this.actionQueue = [];
        this.actionTimer = null;

        this.initGame();
    }

    /**
     * ゲーム全体の初期化 (プレイヤー状態の生成)
     */
    initGame() {
        this.gameState.players = this.room.players.map((p, index) => ({
            id: p.id,
            name: p.name,
            score: 25000,
            seat: index,         // 0:東, 1:南, 2:西, 3:北
            hand: [],
            melds: [],           // 副露面子
            discards: [],        // 捨て牌
            isRiichi: false,
            cards: p.equippedCards || [] // 持ち込んだ能力カード
        }));

        // CardEngineにカードを登録
        this.gameState.players.forEach(p => {
            p.cards.forEach(card => this.cardEngine.registerCard(p.id, card));
        });

        this.startRound();
    }

    /**
     * 局の開始 (配牌と初期トリガー)
     */
    startRound() {
        this.engine.initializeWall(); // 136牌生成・山生成・シャッフル
        
        // 配牌 (親14枚、子13枚)
        const hands = this.engine.distributeTiles(4, this.gameState.dealerIndex);
        this.gameState.players.forEach((p, i) => {
            p.hand = hands[i];
        });

        this.gameState.status = 'PLAYING';
        this.gameState.currentTurn = this.gameState.players[this.gameState.dealerIndex].id;
        this.gameState.tilesLeft = this.engine.tilesLeft;

        // イベントフック: 局開始
        this.gameState.players.forEach(p => {
            this.cardEngine.trigger('ROUND_START', { playerId: p.id });
        });

        this.broadcastGameState();
    }

    /**
     * クライアントからのアクション入力
     */
    handleAction(playerId, actionType, payload) {
        const player = this.gameState.players.find(p => p.id === playerId);
        if (!player) return;

        // 1. 自分の手番のアクション (打牌、ツモ和了、能力使用)
        if (this.gameState.status === 'PLAYING' && this.gameState.currentTurn === playerId) {
            if (actionType === 'DISCARD') {
                this.processDiscard(playerId, payload.tile);
            } else if (actionType === 'TSUMO') {
                this.processWin(playerId, 'TSUMO');
            }
        } 
        // 2. 他人の打牌に対するアクション (ロン、ポン、チー、カン)
        else if (this.gameState.status === 'WAIT_ACTION') {
            this.queueAction(playerId, actionType, payload);
        }
    }

    /**
     * 打牌処理
     */
    processDiscard(playerId, tile) {
        const player = this.gameState.players.find(p => p.id === playerId);
        const idx = player.hand.indexOf(tile);
        if (idx === -1) return;

        // 手牌から削除し河に追加
        player.hand.splice(idx, 1);
        player.discards.push({ tile, isRiichi: player.isRiichi });
        this.gameState.lastDiscard = { playerId, tile };

        // イベントフック: 打牌
        this.cardEngine.trigger('ON_DISCARD', { playerId, tile });

        // 全プレイヤーの鳴き・ロン判定
        this.gameState.status = 'WAIT_ACTION';
        this.actionQueue = [];
        this.broadcastGameState();

        // 5秒間アクションを待機し、その後優先順位に従って解決
        this.actionTimer = setTimeout(() => this.resolveActions(), 5000);
    }

    /**
     * アクションをキューに追加 (優先順位判定用)
     */
    queueAction(playerId, actionType, payload) {
        // 重複削除
        this.actionQueue = this.actionQueue.filter(a => a.playerId !== playerId);
        this.actionQueue.push({ playerId, actionType, payload });

        // 全員(捨てた人以外)から返答が来たら即解決
        if (this.actionQueue.length === this.gameState.players.length - 1) {
            clearTimeout(this.actionTimer);
            this.resolveActions();
        }
    }

    /**
     * 優先順位に基づいた同時アクションの解決
     */
    resolveActions() {
        // 優先順位: 能力カード(1) > ロン(2) > ポン/カン(3) > チー(4) > SKIP(99)
        const priorityMap = { 'ABILITY': 1, 'RON': 2, 'PON': 3, 'KAN': 3, 'CHI': 4, 'SKIP': 99 };
        
        const sorted = this.actionQueue
            .filter(a => a.actionType !== 'SKIP')
            .sort((a, b) => priorityMap[a.actionType] - priorityMap[b.actionType]);

        if (sorted.length > 0) {
            const top = sorted[0];
            this.executeAction(top.playerId, top.actionType, top.payload);
        } else {
            this.nextTurn();
        }
    }

    /**
     * アクションの実行
     */
    executeAction(playerId, type, payload) {
        const player = this.gameState.players.find(p => p.id === playerId);
        
        switch (type) {
            case 'RON':
                this.processWin(playerId, 'RON');
                break;
            case 'PON':
                // エンジンの判定を挟んで副露処理
                if (this.engine.canPon(player.hand, this.gameState.lastDiscard.tile)) {
                    this.performMeld(player, 'PON');
                }
                break;
            case 'CHI':
                if (this.engine.canChi(player.hand, this.gameState.lastDiscard.tile)) {
                    this.performMeld(player, 'CHI');
                }
                break;
            // 他の鳴き処理も同様
        }
    }

    /**
     * 次の手番へ移動 (ツモ処理含む)
     */
    nextTurn() {
        if (this.engine.isRyuukyoku()) {
            this.processDraw();
            return;
        }

        const currentIdx = this.gameState.players.findIndex(p => p.id === this.gameState.currentTurn);
        const nextIdx = (currentIdx + 1) % 4;
        const nextPlayer = this.gameState.players[nextIdx];

        this.gameState.currentTurn = nextPlayer.id;
        this.gameState.status = 'PLAYING';

        // ツモ
        const tile = this.engine.drawTile();
        nextPlayer.hand.push(tile);
        this.gameState.tilesLeft = this.engine.tilesLeft;

        // イベントフック: 手番開始 / ツモ
        this.cardEngine.trigger('TURN_START', { playerId: nextPlayer.id });
        this.cardEngine.trigger('ON_DRAW', { playerId: nextPlayer.id, tile });

        this.broadcastGameState();
    }

    /**
     * 和了処理 (ロン/ツモ)
     */
    processWin(playerId, type) {
        this.gameState.status = 'ROUND_END';
        const player = this.gameState.players.find(p => p.id === playerId);
        
        // エンジンによる役判定の呼び出し
        const lastTile = type === 'RON' ? this.gameState.lastDiscard.tile : player.hand[player.hand.length - 1];
        const yaku = this.engine.calculateYaku(player.hand, player.melds, { isRiichi: player.isRiichi });

        this.broadcastGameEvent({
            type: 'WIN',
            playerId,
            winType: type,
            yaku: yaku
        });
    }

    /**
     * 流局処理
     */
    processDraw() {
        this.gameState.status = 'ROUND_END';
        this.broadcastGameEvent({ type: 'RYUUKYOKU' });
    }

    /**
     * 全プレイヤーに盤面状態を送信 (他人の手牌は秘匿)
     */
    broadcastGameState() {
        this.gameState.players.forEach(p => {
            const safePlayers = this.gameState.players.map(other => ({
                id: other.id,
                name: other.name,
                score: other.score,
                hand: (other.id === p.id) ? other.hand : new Array(other.hand.length).fill('unknown'),
                melds: other.melds,
                discards: other.discards,
                isRiichi: other.isRiichi
            }));

            const payload = { ...this.gameState, players: safePlayers, dora: this.engine.doraIndicators };
            this.room.players.find(rp => rp.id === p.id).ws.send(JSON.stringify({
                type: 'EVENT_GAME_STATE_UPDATE',
                payload
            }));
        });
    }

    /**
     * 特殊イベントのブロードキャスト
     */
    broadcastGameEvent(payload) {
        const data = JSON.stringify({ type: 'EVENT_GAME_ANNOUNCEMENT', payload });
        this.room.players.forEach(p => p.ws.readyState === 1 && p.ws.send(data));
    }
}

module.exports = GameManager;