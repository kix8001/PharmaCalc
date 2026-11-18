import { render } from 'preact'
import { App } from './app'
import './styles.css'

render(<App />, document.getElementById('app')!)

// 電波が無くても使えるように、サービスワーカーを登録する（開発中は使わない）
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {})
  })
}
