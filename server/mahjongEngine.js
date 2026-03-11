/**
 * server/mahjongEngine.js
 * 標準的な麻雀ルールと能力カード用イベントフックを備えた麻雀エンジン
 */
const crypto = require('crypto');

class MahjongEngine {
    constructor() {
        this.wall = [];          // 山牌 (136枚)
        this.deadWall = [];      // 王牌 (14枚)
        this.doraIndicators = []; // ドラ表示牌
        this.uraDoraIndicators = []; // 裏ドラ表示牌
        this.tilesLeft = 0;      // 残り牌数
    }

    // ==========================================
    // 1. 牌生成・山管理
    // ==========================================

    /**
     * 136枚の牌を生成し、山を作成・シャッフルする
     */
    initializeWall() {
        const suits = ['m', 'p', 's']; // 萬子, 筒子, 索子
        const honors = ['z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7']; // 東南西北白發中
        let newWall = [];

        // 数牌 (各種類4枚、5には赤ドラ1枚を含む)
        suits.forEach(suit => {
            for (let i = 1; i <= 9; i++) {
                for (let j = 0; j < 4; j++) {
                    if (i === 5 && j === 0) {
                        newWall.push(`${suit}5r`); // 赤ドラ
                    } else {
                        newWall.push(`${suit}${i}`);
                    }
                }
            }
        });

        // 字牌 (各種類4枚)
        honors.forEach(honor => {
            for (let j = 0; j < 4; j++) {
                newWall.push(honor);
            }
        });

        // シャッフル
        this.wall = this.shuffle(newWall);

        // 王牌(14枚)を切り出す
        this.deadWall = this.wall.splice(-14);
        this.doraIndicators = [this.deadWall[4]]; // 最初のドラ表示牌
        this.uraDoraIndicators = [this.deadWall[9]]; // 最初の裏ドラ表示牌
        this.tilesLeft = this.wall.length;

        this.onRoundStart(); // イベントフック
    }

    /**
     * 暗号論的疑似乱数を用いたシャッフル
     */
    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = crypto.randomBytes(4).readUInt32LE(0) % (i + 1);
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // ==========================================
    // 2. ゲーム進行 (配牌・ツモ・打牌)
    // ==========================================

    /**
     * 4名に配牌を行う (親14枚、子13枚)
     */
    distributeTiles(playerCount = 4, dealerIndex = 0) {
        const hands = Array.from({ length: playerCount }, () => []);
        
        // 通常の配牌手順 (13枚ずつ)
        for (let i = 0; i < 13; i++) {
            for (let p = 0; p < playerCount; p++) {
                hands[p].push(this.wall.shift());
            }
        }
        
        // 親の第1ツモ
        hands[dealerIndex].push(this.wall.shift());
        this.tilesLeft = this.wall.length;
        
        return hands;
    }

    /**
     * 山から1枚引く
     */
    drawTile() {
        if (this.wall.length === 0) return null;
        
        const tile = this.wall.shift();
        this.tilesLeft = this.wall.length;
        
        this.onDraw(tile); // イベントフック
        return tile;
    }

    /**
     * プレイヤーが牌を捨てる
     */
    discardTile(playerId, tile) {
        this.onDiscard(playerId, tile); // イベントフック
        return { playerId, tile };
    }

    // ==========================================
    // 3. 鳴き・判定ロジック
    // ==========================================

    /**
     * ポンが可能か判定
     */
    canPon(hand, targetTile) {
        const base = targetTile.replace('r', '');
        const count = hand.filter(t => t.replace('r', '') === base).length;
        if (count >= 2) {
            this.onPon(); // イベントフック
            return true;
        }
        return false;
    }

    /**
     * チーが可能か判定 (上家からのみ)
     */
    canChi(hand, targetTile) {
        if (targetTile.startsWith('z')) return false;
        const suit = targetTile[0];
        const val = parseInt(targetTile[1]);
        const has = (n) => hand.includes(`${suit}${n}`) || hand.includes(`${suit}${n}r`);

        // 連番チェック
        const patterns = [
            [val - 2, val - 1], // 左
            [val - 1, val + 1], // 中
            [val + 1, val + 2]  // 右
        ];

        const possible = patterns.some(p => p.every(n => n >= 1 && n <= 9 && has(n)));
        if (possible) this.onChi(); // イベントフック
        return possible;
    }

    /**
     * カン(明槓/暗槓)が可能か判定
     */
    canKan(hand, targetTile, isSelfDraw = false) {
        const base = targetTile.replace('r', '');
        const count = hand.filter(t => t.replace('r', '') === base).length;
        const possible = isSelfDraw ? count === 4 : count === 3;
        if (possible) this.onKan(); // イベントフック
        return possible;
    }

    /**
     * ロン/ツモ判定 (4面子1雀頭の簡易チェック)
     */
    canRon(hand, lastTile) {
        const allTiles = [...hand, lastTile];
        // 簡易的な和了判定アルゴリズム (再帰的な面子抜き)
        const counts = this.getTileCounts(allTiles);
        
        // 雀頭を仮定して残りが面子になるか
        for (let tile in counts) {
            if (counts[tile] >= 2) {
                const tempCounts = { ...counts };
                tempCounts[tile] -= 2;
                if (this.checkMentsu(tempCounts)) {
                    this.onRon(); // イベントフック
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * 流局判定
     */
    isRyuukyoku() {
        return this.wall.length === 0;
    }

    // ==========================================
    // 4. 将来の能力カード用イベントフック
    // ==========================================
    onRoundStart() { /* 能力カード側で上書き */ }
    onTurnStart(playerId) { /* 能力カード側で上書き */ }
    onDraw(tile) { /* 能力カード側で上書き */ }
    onDiscard(playerId, tile) { /* 能力カード側で上書き */ }
    onPon() { /* 能力カード側で上書き */ }
    onChi() { /* 能力カード側で上書き */ }
    onKan() { /* 能力カード側で上書き */ }
    onRon() { /* 能力カード側で上書き */ }

    // ==========================================
    // ユーティリティ
    // ==========================================
    getTileCounts(tiles) {
        const counts = {};
        tiles.forEach(t => {
            const base = t.replace('r', '');
            counts[base] = (counts[base] || 0) + 1;
        });
        return counts;
    }

    checkMentsu(counts) {
        const tiles = Object.keys(counts).sort();
        for (let t of tiles) {
            if (counts[t] === 0) continue;
            // 刻子
            if (counts[t] >= 3) {
                counts[t] -= 3;
                if (this.checkMentsu(counts)) return true;
                counts[t] += 3;
            }
            // 順子
            if (!t.startsWith('z')) {
                const s = t[0], v = parseInt(t[1]);
                const t2 = `${s}${v+1}`, t3 = `${s}${v+2}`;
                if (counts[t2] > 0 && counts[t3] > 0) {
                    counts[t]--; counts[t2]--; counts[t3]--;
                    if (this.checkMentsu(counts)) return true;
                    counts[t]++; counts[t2]++; counts[t3]++;
                }
            }
            return false;
        }
        return true;
    }
}

module.exports = MahjongEngine;