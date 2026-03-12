const RNG = require('./rng');

class MahjongEngine {
    constructor() {
        this.tiles = [];          // 山牌
        this.deadWall = [];       // 王牌（14枚固定）
        this.hands = {};          // 各プレイヤーの手牌 { playerId: ['m1', 'p9', ...] }
        this.discards = {};       // 各プレイヤーの捨て牌 { playerId: ['z1', ...] }
        this.melds = {};          // 各プレイヤーの副露（鳴き） { playerId: [{ type: 'PON', tiles: ['m1','m1','m1'] }] }
        this.playerIds = [];      // プレイヤーIDの配列（インデックス0が起家）
        this.turnIndex = 0;       // 現在の手番のインデックス (0~3)
        this.doraIndicators = []; // ドラ表示牌
        this.uraDoraIndicators = []; // 裏ドラ表示牌
        this.roundState = 'init'; // init, playing, finished, ryukyoku

        // 能力カード用フックイベントの登録先
        this.hooks = {
            onTurnStart: [],
            onDraw: [],
            onDiscard: [],
            onRiichi: []
        };
    }

    // 牌山の生成（赤ドラ各1枚を含む136枚）
    generateTiles() {
        const deck = [];
        const suits = ['m', 'p', 's'];
        
        // 数牌の生成
        for (const suit of suits) {
            for (let i = 1; i <= 9; i++) {
                for (let j = 0; j < 4; j++) {
                    // 各5の牌のうち1枚を赤ドラ(0)にする
                    if (i === 5 && j === 0) {
                        deck.push(`${suit}0`);
                    } else {
                        deck.push(`${suit}${i}`);
                    }
                }
            }
        }
        
        // 字牌の生成 (z1:東, z2:南, z3:西, z4:北, z5:白, z6:発, z7:中)
        for (let i = 1; i <= 7; i++) {
            for (let j = 0; j < 4; j++) {
                deck.push(`z${i}`);
            }
        }
        return deck;
    }

    // ゲーム（局）の初期化
    initializeGame(playerIds) {
        this.playerIds = playerIds;
        this.playerIds.forEach(id => {
            this.hands[id] = [];
            this.discards[id] = [];
            this.melds[id] = [];
        });

        // 牌の生成とシャッフル
        let deck = this.generateTiles();
        this.tiles = RNG.shuffle(deck);

        // 王牌(ワンパイ)を14枚確保
        this.deadWall = this.tiles.splice(-14);
        
        // ドラ表示牌をめくる（王牌の3枚目）
        this.doraIndicators.push(this.deadWall[5]);
        this.uraDoraIndicators.push(this.deadWall[4]); // 裏ドラは非公開だがデータとしては保持

        // 配牌（各プレイヤーに13枚）
        for (let i = 0; i < 13; i++) {
            this.playerIds.forEach(id => {
                this.hands[id].push(this.tiles.pop());
            });
        }

        this.sortHands();
        this.roundState = 'playing';
        this.turnIndex = 0; // 親（起家）からスタート
    }

    // 手牌のソート処理
    sortHands() {
        const sortOrder = (a, b) => {
            return a.localeCompare(b);
        };
        for (const id in this.hands) {
            this.hands[id].sort(sortOrder);
        }
    }

    // クライアントへ送信する状態（チート防止のため他人の手牌と裏ドラは隠す）
    getPlayerState(playerId) {
        return {
            hand: this.hands[playerId],
            discards: this.discards,
            melds: this.melds,
            doraIndicators: this.doraIndicators,
            tilesLeft: this.tiles.length,
            currentTurn: this.playerIds[this.turnIndex],
            myTurn: this.playerIds[this.turnIndex] === playerId
        };
    }

    // --- アクション処理 ---

    async drawTile(playerId) {
        if (this.roundState !== 'playing') return null;
        if (this.tiles.length === 0) {
            this.roundState = 'ryukyoku';
            return { type: 'ryukyoku' };
        }

        await this.executeHooks('onDraw', { playerId });

        const tile = this.tiles.pop();
        this.hands[playerId].push(tile);
        return { type: 'draw', tile: tile };
    }

    // 捨て牌処理（GameManagerでの待機のため、ここではターンを進めない）
    discardTile(playerId, tileIndex) {
        if (this.playerIds[this.turnIndex] !== playerId) return null;
        
        const hand = this.hands[playerId];
        if (tileIndex < 0 || tileIndex >= hand.length) return null;

        const discardedTile = hand.splice(tileIndex, 1)[0];
        this.discards[playerId].push(discardedTile);
        this.sortHands();

        return { tile: discardedTile };
    }

    nextTurn() {
        this.turnIndex = (this.turnIndex + 1) % this.playerIds.length;
        this.executeHooks('onTurnStart', { playerId: this.playerIds[this.turnIndex] });
    }

    getCurrentPlayer() {
        return this.playerIds[this.turnIndex];
    }

    setTurn(playerId) {
        this.turnIndex = this.playerIds.indexOf(playerId);
    }

    // 鳴きの実行（ポン・チー・カン）
    executeMeld(playerId, type, targetTile, consumeTiles) {
        consumeTiles.forEach(t => {
            const idx = this.hands[playerId].indexOf(t);
            if (idx !== -1) this.hands[playerId].splice(idx, 1);
        });
        
        this.melds[playerId].push({ type, tiles: [...consumeTiles, targetTile] });
        this.sortHands();
    }

    // フック実行システム
    async executeHooks(eventName, context) {
        const hooks = this.hooks[eventName];
        for (const hook of hooks) {
            await hook(this, context); 
        }
    }
}

module.exports = MahjongEngine;