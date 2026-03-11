/**
 * public/network.js
 * WebSocket通信レイヤー: サーバーとの接続管理、メッセージ送受信、イベント分配を担当
 */
(function(global) {
    'use strict';

    class Network {
        constructor() {
            this.socket = null;
            this.listeners = {}; // イベント名とコールバックのマップ
            this.url = '';
        }

        /**
         * サーバーとの WebSocket 接続を開始する
         */
        connect() {
            // 現在のプロトコルに合わせてwsまたはwssを選択
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            this.url = `${protocol}//${window.location.host}`;

            this.socket = new WebSocket(this.url);

            this.socket.onopen = () => {
                console.log('[Network] Connected to server.');
                this.emit('connected', null);
            };

            this.socket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    // サーバーからのメッセージ形式 { type, payload } または { type, data } に対応
                    const type = message.type;
                    const data = message.payload || message.data || null;

                    console.log(`[Network] Received: ${type}`, data);
                    this.emit(type, data);
                } catch (e) {
                    console.error('[Network] Failed to parse message:', e);
                }
            };

            this.socket.onclose = () => {
                console.warn('[Network] Disconnected from server.');
                this.emit('disconnected', null);
            };

            this.socket.onerror = (error) => {
                console.error('[Network] WebSocket error:', error);
                this.emit('error', error);
            };
        }

        /**
         * サーバーへメッセージを送信する
         * @param {string} type - JOIN_ROOM, DISCARD_TILE, RON など
         * @param {Object} data - 送信するペイロード
         */
        send(type, data = {}) {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                const message = JSON.stringify({
                    type: type,
                    payload: data, // server/server.js の期待する形式
                    requestID: `req_${Date.now()}` // サーバー側のリクエスト管理用
                });
                this.socket.send(message);
                console.log(`[Network] Sent: ${type}`, data);
            } else {
                console.error('[Network] Cannot send message: Socket is not open.');
            }
        }

        /**
         * イベントリスナーを登録する
         * @param {string} type - ROOM_UPDATE, GAME_STATE などの受信タイプ
         * @param {Function} callback - 受信時に実行する関数
         */
        on(type, callback) {
            if (!this.listeners[type]) {
                this.listeners[type] = [];
            }
            this.listeners[type].push(callback);
        }

        /**
         * 登録されたリスナーにイベントを分配する (内部用)
         */
        emit(type, data) {
            if (this.listeners[type]) {
                this.listeners[type].forEach(callback => callback(data));
            }
        }
    }

    // client.js から利用できるようにグローバルに公開
    global.Network = Network;

})(typeof window !== 'undefined' ? window : this);