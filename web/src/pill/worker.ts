/// <reference lib="webworker" />
import { analyze, type Rect } from './pillCounter'
import { analyzeShapes } from './shapeCounter'

// 錠剤カウントの計算は重いので、画面を止めないよう別の作業スレッドで行う
self.onmessage = (e: MessageEvent<{ rgba: Uint8ClampedArray; width: number; height: number; sensitivity: number; roi: Rect | null; job: number; shape?: 'round' | 'any' }>) => {
  const { rgba, width, height, sensitivity, roi, job, shape } = e.data
  // 丸い錠剤は円の検出、楕円・長い錠剤・カプセルは形を問わない数え方
  const r = shape === 'any' ? analyzeShapes(rgba, width, height, sensitivity, roi) : analyze(rgba, width, height, sensitivity, roi)
  ;(self as unknown as Worker).postMessage({ job, ...r })
}
