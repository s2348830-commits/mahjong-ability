class Network {
    constructor() {
        this.ws = null;
        this.messageQueue = [];
        this.reqIdCounter = 0;
        this.callbacks = new Map();
    }

    connect() {
        this.ws = new WebSocket(`ws://${window.location.host}`);
        
        this.ws.onopen = () => {
            console.log('Connected to server');
            this.flushQueue();
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
        };

        this.ws.onclose = () => {
            console.log('Disconnected. Attempting reconnect...');
            // 切断処理（60秒タイマーなどはここでトリガー）
        };
    }

    send(type, payload, callback) {
        const reqId = ++this.reqIdCounter;
        if (callback) this.callbacks.set(reqId, callback);

        const message = JSON.stringify({ type, payload, reqId });
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(message);
        } else {
            this.messageQueue.push(message);
        }
    }

    flushQueue() {
        while (this.messageQueue.length > 0) {
            this.ws.send(this.messageQueue.shift());
        }
    }

    handleMessage(data) {
        // コールバックの解決 (ACKの処理)
        if (data.reqId && this.callbacks.has(data.reqId)) {
            this.callbacks.get(data.reqId)(data);
            this.callbacks.delete(data.reqId);
        }

        // 状態に応じたイベント発火（client.jsやui.jsでリッスンする）
        document.dispatchEvent(new CustomEvent('serverMessage', { detail: data }));
    }
}