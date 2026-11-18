/// <reference lib="webworker" />
import { analyze, type Rect } from './pillCounter'

// 錠剤カウントの計算は重いので、画面を止めないよう別の作業スレッドで行う
self.onmessage = (e: MessageEvent<{ rgba: Uint8ClampedArray; width: number; height: number; sensitivity: number; roi: Rect | null; job: number }>) => {
  const { rgba, width, height, sensitivity, roi, job } = e.data
  const r = analyze(rgba, width, height, sensitivity, roi)
  ;(self as unknown as Worker).postMessage({ job, ...r })
}
