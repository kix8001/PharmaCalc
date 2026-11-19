import { render } from 'preact'
import { App } from './app'
import './styles.css'

render(<App />, document.getElementById('app')!)

// 電波が無くても使えるように、サービスワーカーを登録する（開発中は使わない）
// 新しい版がサーバーに置かれたら、届いたその場で画面を読み込み直す（ブックマークやホーム画面への追加はし直さなくてよい）
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // 最初に入れたとき（前の版が無いとき）は読み込み直さない
  const hadController = !!navigator.serviceWorker.controller
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return
    reloading = true
    location.reload()
  })
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL, updateViaCache: 'none' })
      .then((reg) => {
        // 開いたままにしていたアプリが表に戻ってきたときも、新しい版があるか確かめる
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {})
        })
      })
      .catch(() => {})
  })
}
