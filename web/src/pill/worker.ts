/// <reference lib="webworker" />
import { analyze, type Rect } from './pillCounter'
import { analyzeOblong, measureSample } from './shapeCounter'

// 錠剤カウントの計算は重いので、画面を止めないよう別の作業スレッドで行う
self.onmessage = (
  e: MessageEvent<{ rgba: Uint8ClampedArray; width: number; height: number; sensitivity: number; roi: Rect | null; job: number; shape?: 'round' | 'any'; sample?: Rect | null }>,
) => {
  const { rgba, width, height, sensitivity, roi, job, shape, sample } = e.data
  let r: { markers: unknown[]; unitRadius: number } = { markers: [], unitRadius: 12 }
  if (shape === 'any') {
    // 楕円・長い錠剤・カプセル：囲んだ見本の1錠の大きさと色で、カプセル形の輪郭を探す
    const size = sample ? measureSample(rgba, width, height, sample) : null
    if (size) r = analyzeOblong(rgba, width, height, sensitivity, roi, size)
  } else {
    r = analyze(rgba, width, height, sensitivity, roi)
  }
  ;(self as unknown as Worker).postMessage({ job, ...r })
}
