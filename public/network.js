(function(global) {
    'use strict';

    class NetworkManager {
        constructor() {
            this.socket = null;
            this.messageQueue = [];
            this.requestCounter = 0;
            this.callbacks = new Map(); // requestIDに紐づくコールバック
        }

        connect() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}`;
            
            this.socket = new WebSocket(wsUrl);

            this.socket.onopen = () => {
                console.log('Connected to server');
                this.flushQueue();
            };

            this.socket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            };

            this.socket.onclose = () => {
                console.log('Disconnected. Attempting to reconnect...');
                setTimeout(() => this.connect(), 3000); // 再接続処理
            };
        }

        sendRequest(type, payload) {
            return new Promise((resolve, reject) => {
                const requestID = `req_${++this.requestCounter}`;
                const message = { type, requestID, payload };

                this.callbacks.set(requestID, { resolve, reject });

                if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                    this.socket.send(JSON.stringify(message));
                } else {
                    this.messageQueue.push(message);
                }
            });
        }

        handleMessage(data) {
            // ACK/Responseの処理
            if (data.requestID && this.callbacks.has(data.requestID)) {
                const callback = this.callbacks.get(data.requestID);
                if (data.status === 'success') {
                    callback.resolve(data.payload);
                } else {
                    callback.reject(data.payload);
                }
                this.callbacks.delete(data.requestID);
                return;
            }

            // サーバーからのイベント（状態更新など）の処理
            if (data.eventID) {
                // TODO: SyncManagerへの連携、イベント処理、そしてACKをサーバーに返す
                this.socket.send(JSON.stringify({ type: 'EVENT_ACK', eventID: data.eventID }));
            }
        }

        flushQueue() {
            while (this.messageQueue.length > 0) {
                const msg = this.messageQueue.shift();
                this.socket.send(JSON.stringify(msg));
            }
        }
    }

    // グローバルオブジェクト（window）に安全にアタッチ
    global.NetworkManager = NetworkManager;

})(typeof window !== 'undefined' ? window : this);