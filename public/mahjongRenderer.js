class MahjongRenderer {
    constructor() {
        this.handContainer = document.getElementById('my-hand');
        this.discardContainer = document.getElementById('my-discards');
        this.doraContainer = document.getElementById('dora-indicators');
        this.tilesLeftSpan = document.getElementById('tiles-left');
    }

    // サーバーからの文字列(m1, z7など)を日本語の牌名に変換
    getTileDisplay(tileStr) {
        if (!tileStr) return '';
        const suit = tileStr[0];
        const num = tileStr[1];
        
        if (suit === 'z') {
            const honors = ['東', '南', '西', '北', '白', '發', '中'];
            return honors[parseInt(num) - 1];
        }
        
        const suitName = suit === 'm' ? '萬' : suit === 'p' ? '筒' : '索';
        return num === '0' ? `5${suitName}` : `${num}${suitName}`; // 0は赤ドラ
    }

    // DOM要素の生成
    createTileElement(tileStr, index = -1, isHand = false) {
        const div = document.createElement('div');
        div.className = 'tile';
        if (tileStr[1] === '0') div.classList.add('red'); // 赤ドラ色付け

        div.textContent = this.getTileDisplay(tileStr);

        // 手牌の場合は、クリックして捨てられるように dataset にインデックスを保存
        if (isHand) {
            div.dataset.index = index;
            div.dataset.tileStr = tileStr;
        }

        return div;
    }

    // 画面全体の描画更新
    renderState(state) {
        // 1. 情報の更新
        this.tilesLeftSpan.textContent = state.tilesLeft;
        
        this.doraContainer.innerHTML = '';
        state.doraIndicators.forEach(tile => {
            this.doraContainer.appendChild(this.createTileElement(tile));
        });

        // 2. 自分の手牌を描画
        this.handContainer.innerHTML = '';
        state.hand.forEach((tile, index) => {
            const tileEl = this.createTileElement(tile, index, true);
            this.handContainer.appendChild(tileEl);
        });

        // 3. 自分の捨て牌を描画（簡易的に最初のプレイヤーIDをキーにして描画）
        // ※本来は4人分の捨て牌エリアを作る必要がありますが、今回はテスト用です
        this.discardContainer.innerHTML = '';
        const myId = Object.keys(state.discards)[0]; // 仮取得
        if (state.discards[myId]) {
            state.discards[myId].forEach(tile => {
                this.discardContainer.appendChild(this.createTileElement(tile));
            });
        }
    }
}