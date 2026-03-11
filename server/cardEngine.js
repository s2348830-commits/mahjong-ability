/**
 * server/cardEngine.js
 * 能力カードの条件判定と効果実行を管理するサーバー側エンジン
 */

class CardEngine {
    /**
     * @param {Object} gameManager - GameManagerのインスタンス（ゲーム状態操作用）
     */
    constructor(gameManager) {
        this.gameManager = gameManager;
        // プレイヤーごとの登録済みカード: { playerId: [card1, card2, ...] }
        this.playerCards = new Map();
    }

    /**
     * プレイヤーにカードを登録（装備）する
     * @param {string} playerId 
     * @param {Object} card - { name, image, conditions[], effects[] }
     */
    registerCard(playerId, card) {
        if (!this.playerCards.has(playerId)) {
            this.playerCards.set(playerId, []);
        }
        this.playerCards.get(playerId).push(card);
        console.log(`[CardEngine] Card registered for ${playerId}: ${card.name}`);
    }

    /**
     * 特定のイベントが発生した際にカードの発動をチェックする
     * @param {string} eventType - TURN_START, RIICHI, PON, CHI, TSUMO, RON, ROUND_START など
     * @param {Object} context - { playerId, ... }
     */
    trigger(eventType, context) {
        const { playerId } = context;
        const cards = this.playerCards.get(playerId);
        
        if (!cards) return;

        cards.forEach(card => {
            // カードの条件配列に現在のイベントタイプが含まれているか確認
            if (card.conditions && card.conditions.includes(eventType)) {
                console.log(`[CardEngine] Triggered: ${card.name} for ${playerId} on ${eventType}`);
                
                // カードに設定されたすべての効果を実行
                if (card.effects) {
                    card.effects.forEach(effect => {
                        this.executeEffect(effect, { ...context, cardName: card.name });
                    });
                }

                // 発動したことを全プレイヤーに通知
                this.gameManager.broadcastGameEvent({
                    type: 'CARD_ACTIVATED',
                    playerId: playerId,
                    cardName: card.name,
                    eventType: eventType
                });
            }
        });
    }

    /**
     * カードの効果を具体的に実行する
     * @param {string} effect - DRAW_TILE, DISCARD_TILE, DRAW_TWO_DISCARD_TWO, ADD_DORA など
     * @param {Object} context - { playerId, cardName }
     */
    executeEffect(effect, context) {
        const { playerId } = context;
        const playerState = this.gameManager.gameState.players.find(p => p.id === playerId);
        
        if (!playerState) return;

        console.log(`[CardEngine] Executing effect: ${effect} for ${playerId}`);

        switch (effect) {
            case 'DRAW_TILE':
                // 牌を1枚引く
                const tile = this.gameManager.engine.drawTile();
                if (tile) playerState.hand.push(tile);
                break;

            case 'DISCARD_TILE':
                // 牌を1枚捨てる（簡易的に最後の一枚を捨てる例）
                if (playerState.hand.length > 0) {
                    const discarded = playerState.hand.pop();
                    playerState.discards.push({ tile: discarded, isRiichi: false });
                }
                break;

            case 'DRAW_TWO_DISCARD_TWO':
                // 2枚引いて2枚捨てる
                for (let i = 0; i < 2; i++) {
                    const t = this.gameManager.engine.drawTile();
                    if (t) playerState.hand.push(t);
                }
                for (let i = 0; i < 2; i++) {
                    if (playerState.hand.length > 0) {
                        const d = playerState.hand.pop();
                        playerState.discards.push({ tile: d, isRiichi: false });
                    }
                }
                break;

            case 'ADD_DORA':
                // ドラ表示牌を増やす（王牌からめくる）
                this.gameManager.engine.drawRinshanTile(); // 便宜上リンシャン処理を流用
                break;

            default:
                console.warn(`[CardEngine] Unknown effect type: ${effect}`);
                break;
        }

        // 状態が変化したのでクライアントに同期
        this.gameManager.broadcastGameState();
    }
}

module.exports = CardEngine;