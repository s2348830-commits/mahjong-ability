// server/cardEngine.js

class CardEngine {
    constructor(gameManager) {
        this.gameManager = gameManager; // 状態操作のためGameManagerの参照を保持
    }

    /**
     * プレイヤーがカードを使用できるか（条件を満たしているか）検証する
     */
    canPlayCard(playerId, card, eventContext) {
        if (!card || !card.condition) return true; // 条件なしは発動可能
        return this.evaluateCondition(card.condition, playerId, eventContext);
    }

    evaluateCondition(condition, playerId, context) {
        switch (condition.type) {
            case 'AND':
                return condition.conditions.every(c => this.evaluateCondition(c, playerId, context));
            case 'OR':
                return condition.conditions.some(c => this.evaluateCondition(c, playerId, context));
            case 'IS_MY_TURN':
                return this.gameManager.gameState.currentTurn === playerId;
            case 'ON_DISCARD':
                return context.eventType === 'DISCARD' && context.targetPlayer !== playerId;
            case 'IS_RIICHI':
                const playerState = this.gameManager.gameState.players.find(p => p.id === playerId);
                return playerState && playerState.isRiichi;
            default:
                return false;
        }
    }

    /**
     * カードの効果を実行する
     */
    executeCardEffect(playerId, card, eventContext) {
        if (!card || !card.effect) return;
        this.resolveEffect(card.effect, playerId, eventContext);
        
        // ログやUI用のイベント通知
        this.gameManager.broadcastGameEvent({
            type: 'CARD_PLAYED',
            playerId: playerId,
            cardName: card.name
        });
    }

    resolveEffect(effect, playerId, context) {
        const playerState = this.gameManager.gameState.players.find(p => p.id === playerId);
        if (!playerState) return;

        switch (effect.type) {
            case 'DRAW_CARDS':
                for (let i = 0; i < effect.amount; i++) {
                    const tile = this.gameManager.engine.drawTile();
                    if (tile) playerState.hand.push(tile);
                }
                break;
            case 'DISCARD_CARDS':
                // 自動でランダムに捨てるか、クライアントに選択させる（今回はランダム例）
                for (let i = 0; i < effect.amount; i++) {
                    if (playerState.hand.length > 0) {
                        const dropped = playerState.hand.pop();
                        playerState.discards.push({ tile: dropped, isRiichi: false });
                    }
                }
                break;
            case 'ADD_DORA':
                // 強制的にカンドラのようにドラをめくる
                if (this.gameManager.engine.deadWall.length > 14 - 4) {
                    this.gameManager.engine.doraIndicators.push(this.gameManager.engine.deadWall[4 + this.gameManager.engine.doraIndicators.length]);
                }
                break;
            case 'CHANGE_SCORE':
                playerState.score += effect.amount;
                break;
            case 'SEQUENCE':
                // 複数の効果を順次実行
                effect.actions.forEach(act => this.resolveEffect(act, playerId, context));
                break;
        }
        
        // 状態が変化したため、全員に同期する
        this.gameManager.broadcastGameState();
    }
}

module.exports = CardEngine;