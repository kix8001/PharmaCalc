// 背面カメラ（アウトカメラ）を選んで開く。スキャンと錠剤カウントで使う
import { persistedStore } from '../core/store'

/** 選んだ背面カメラ（deviceId。空＝自動で選ぶ） */
export const cameraStore = persistedStore<string>('cameraDevice', '')

export interface CamInfo {
  id: string
  label: string
}

/** 背面のカメラの一覧（許可を得たあとでないと名前が分からない） */
export async function backCameras(): Promise<CamInfo[]> {
  const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput')
  const back = all.filter((d) => /back|rear|environment|背面|後面/i.test(d.label))
  // 名前で分からないときも、前面（インカメラ）と分かる物は外す
  const notFront = all.filter((d) => !/front|user|facetime|前面|フロント|イン/i.test(d.label))
  return (back.length ? back : notFront.length ? notFront : all).map((d) => ({ id: d.deviceId, label: d.label }))
}

/**
 * 背面カメラ（アウトカメラ）を開く。選んだカメラ→「背面に限る」→「なるべく背面」の順に試し、
 * それでも前面（インカメラ）が開いたら、背面と分かるカメラに替える
 */
export async function openBackCamera(size: MediaTrackConstraints, saved = ''): Promise<MediaStream> {
  const tries: MediaTrackConstraints[] = [
    ...(saved ? [{ deviceId: { exact: saved }, ...size }] : []),
    { facingMode: { exact: 'environment' }, ...size },
    { facingMode: { ideal: 'environment' }, ...size },
  ]
  let stream: MediaStream | null = null
  let err: unknown = null
  for (const v of tries) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: v })
      break
    } catch (e) {
      err = e
      if ((e as DOMException)?.name === 'NotAllowedError') throw e
    }
  }
  if (!stream) throw err
  if (stream.getVideoTracks()[0]?.getSettings().facingMode === 'user') {
    const back = (await backCameras()).find((c) => /back|rear|environment|背面|後面/i.test(c.label))
    if (back) {
      stream.getTracks().forEach((t) => t.stop())
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: back.id }, ...size } })
    }
  }
  return stream
}

/**
 * 自動で選ぶカメラ。Android の Chrome では背面カメラが何台も並び、近くにピントが合わない物（超広角・望遠など）が
 * 選ばれることがあるので、メインのカメラ（名前が「camera2 0」や「camera 0」）を優先する
 */
export function preferredCamera(cams: CamInfo[]): string | null {
  const saved = cameraStore.get()
  if (saved && cams.some((c) => c.id === saved)) return saved
  const main = cams.find((c) => /camera2? 0\b/i.test(c.label))
  return main ? main.id : null
}

