class Network {
    constructor() {
        this.ws = null;
        this.messageQueue = [];
        this.reqIdCounter = 0;
        this.callbacks = new Map();
    }

    connect() {
        // 現在のページのプロトコルを確認し、ws と wss を自動で切り替える
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${protocol}//${window.location.host}`);
        
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
        if (data.reqId && this.callbacks.has(data.reqId)) {
            this.callbacks.get(data.reqId)(data);
            this.callbacks.delete(data.reqId);
        }

        document.dispatchEvent(new CustomEvent('serverMessage', { detail: data }));
    }
}