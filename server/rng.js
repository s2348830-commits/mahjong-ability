class RNG {
    // Fisher-Yatesアルゴリズムによる配列のシャッフル
    static shuffle(array) {
        let currentIndex = array.length, randomIndex;

        // シャッフルする要素が残っている間ループ
        while (currentIndex !== 0) {
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;

            // 現在の要素とランダムに選んだ要素を交換
            [array[currentIndex], array[randomIndex]] = [
                array[randomIndex], array[currentIndex]
            ];
        }

        return array;
    }
}

module.exports = RNG;