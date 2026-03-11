// server/ai.js

class SimpleAI {
    constructor(gameManager, playerId) {
        this.gameManager = gameManager;
        this.playerId = playerId;
        this.thinkingTime = 1500; // 人間らしさを出すための思考時間（ミリ秒）
    }

    /**
     * AIの行動を評価し、実行する
     */
    evaluateAction() {
        const gameState = this.gameManager.gameState;
        const playerState = gameState.players.find(p => p.id === this.playerId);
        if (!playerState) return;

        // 自分の手番の場合（打牌アクション）
        if (gameState.status === 'PLAYING' && gameState.currentTurn === this.playerId) {
            setTimeout(() => this.decideDiscard(playerState), this.thinkingTime);
        }
        // 他の人が打牌した直後の待機時間（鳴き・ロンの判断）
        else if (gameState.status === 'WAIT_ACTION') {
            // 現在の簡易AIは鳴きをすべてパスし、ロンできる場合のみロンする
            setTimeout(() => this.decideResponse(playerState, gameState.lastDiscard), 1000);
        }
    }

    decideDiscard(playerState) {
        const hand = playerState.hand;
        if (hand.length === 0) return;

        // 【簡易ロジック】字牌（z）を優先して捨て、それ以外は一番右の牌（ツモ牌）を捨てる
        // ※ 本格的なAIにする場合は、ここでシャンテン数計算アルゴリズムを呼び出します
        let tileToDiscard = hand[hand.length - 1]; // デフォルトはツモ切り
        
        const honorTile = hand.find(t => t.startsWith('z'));
        if (honorTile) {
            tileToDiscard = honorTile;
        }

        this.gameManager.handleAction(this.playerId, 'DISCARD', { tile: tileToDiscard });
    }

    decideResponse(playerState, lastDiscard) {
        // ロン可能かどうかの判定（エンジンに問い合わせる）
        const canRon = this.gameManager.engine.canRon(playerState.hand, playerState.melds, lastDiscard.tile);
        
        if (canRon) {
            this.gameManager.queueAction(this.playerId, 'RON', {});
        } else {
            // ロンできない場合はパス
            this.gameManager.queueAction(this.playerId, 'SKIP', {});
        }
    }
}

module.exports = SimpleAI;