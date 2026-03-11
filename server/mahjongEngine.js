// server/mahjongEngine.js
const crypto = require('crypto');

class MahjongEngine {
    constructor() {
        this.tiles = [];        // 山牌
        this.deadWall = [];     // 王牌（ドラ表示牌、嶺上牌など14枚）
        this.doraIndicators = []; // ドラ表示牌
        this.uraDoraIndicators = []; // 裏ドラ表示牌
    }

    /**
     * ゲーム開始時の山牌生成とシャッフル
     */
    initializeWall() {
        const suits = ['m', 'p', 's']; // 萬子、筒子、索子
        const honors = ['z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7']; // 東南西北白発中
        let wall = [];

        // 萬子・筒子・索子の生成 (赤ドラ各1枚)
        suits.forEach(suit => {
            for (let i = 1; i <= 9; i++) {
                for (let j = 0; j < 4; j++) {
                    // 各5の牌の1枚目を赤ドラとする
                    if (i === 5 && j === 0) {
                        wall.push(`${suit}5r`);
                    } else {
                        wall.push(`${suit}${i}`);
                    }
                }
            }
        });

        // 字牌の生成
        honors.forEach(honor => {
            for (let j = 0; j < 4; j++) {
                wall.push(honor);
            }
        });

        this.tiles = this.shuffle(wall);
        
        // 王牌(14枚)の分離
        this.deadWall = this.tiles.splice(-14);
        
        // 最初のドラ表示牌と裏ドラ表示牌をセット
        this.doraIndicators = [this.deadWall[4]];
        this.uraDoraIndicators = [this.deadWall[9]];
    }

    /**
     * 暗号論的疑似乱数を用いた安全なシャッフル (サーバー権威)
     */
    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const randomBytes = crypto.randomBytes(4);
            const j = randomBytes.readUInt32LE(0) % (i + 1);
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    /**
     * 山から1枚引く
     */
    drawTile() {
        if (this.tiles.length === 0) return null; // 流局
        return this.tiles.shift();
    }

    /**
     * 嶺上牌から1枚引く（カン発生時）
     */
    drawRinshanTile() {
        if (this.deadWall.length <= 14 - 4) return null; // カンは4回まで
        const tile = this.deadWall.shift();
        // 嶺上牌を引いた分、通常の山から1枚王牌に補充
        this.deadWall.push(this.tiles.pop());
        // カンドラをめくる
        this.doraIndicators.push(this.deadWall[4 + this.doraIndicators.length]);
        this.uraDoraIndicators.push(this.deadWall[9 + this.uraDoraIndicators.length]);
        return tile;
    }

    /**
     * 鳴き判定群
     */
    canPon(hand, targetTile) {
        const baseTile = targetTile.replace('r', ''); // 赤ドラの 'r' を無視して判定
        let count = hand.filter(t => t.replace('r', '') === baseTile).length;
        return count >= 2;
    }

    canKan(hand, targetTile) {
        const baseTile = targetTile.replace('r', '');
        let count = hand.filter(t => t.replace('r', '') === baseTile).length;
        return count >= 3;
    }

    canChii(hand, targetTile) {
        // 字牌はチー不可
        if (targetTile.startsWith('z')) return false;

        const suit = targetTile[0];
        const num = parseInt(targetTile[1]);
        if (isNaN(num)) return false;

        const hasTile = (n) => hand.some(t => t.startsWith(suit) && parseInt(t[1]) === n);

        const canLeft = num >= 3 && hasTile(num - 2) && hasTile(num - 1);
        const canCenter = num >= 2 && num <= 8 && hasTile(num - 1) && hasTile(num + 1);
        const canRight = num <= 7 && hasTile(num + 1) && hasTile(num + 2);

        return canLeft || canCenter || canRight;
    }

    canRon(hand, melds, targetTile) {
        // TODO: 本格的なシャンテン数計算と役判定アルゴリズムをここに組み込む。
        // ここではゲームを進行させるためのダミーとして、手牌が13枚であればロン可能（天和・地和想定）のような簡略化ロジックを入れるか、
        // 外部のシャンテン計算ライブラリ（syanten等）を繋ぎ込む口として用意します。
        
        // 完全動作させるための仮実装: 手牌+対象牌で特定の条件を満たしたとする
        const allTiles = [...hand, targetTile];
        if (allTiles.length === 14) {
            // 仮のあがり判定（常にfalseだが、テスト時はtrueに書き換えてテスト可能）
            return false; 
        }
        return false;
    }

    getTilesLeft() {
        return this.tiles.length;
    }
}

module.exports = MahjongEngine;