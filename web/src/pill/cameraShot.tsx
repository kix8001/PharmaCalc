// 錠剤カウントの撮影画面。端末のカメラアプリに任せるとインカメラで開くことがあるので、アプリの中で背面カメラを開いて撮る
import { useEffect, useRef, useState } from 'preact/hooks'
import { X } from 'lucide-preact'
import { backCameras, openBackCamera, preferredCamera } from '../barcode/camera'

/** 静止画はなるべく高い解像度で（数えるときは長辺 1200 画素に縮める） */
const SIZE: MediaTrackConstraints = { width: { ideal: 3840 }, height: { ideal: 2160 } }

export function CameraShot({ onShot, onClose, onFail }: { onShot: (f: File) => void; onClose: () => void; onFail: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  const stream = useRef<MediaStream | null>(null)

  useEffect(() => {
    let stop = false
    ;(async () => {
      try {
        let st = await openBackCamera(SIZE)
        // 背面カメラが何台もあるときは、メインのカメラ（近くにピントが合う物）に替える
        const want = preferredCamera(await backCameras().catch(() => []))
        if (want && want !== st.getVideoTracks()[0]?.getSettings().deviceId) {
          st.getTracks().forEach((t) => t.stop())
          st = await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: want }, ...SIZE } })
        }
        if (stop) return st.getTracks().forEach((t) => t.stop())
        stream.current = st
        const v = video.current!
        v.srcObject = st
        await v.play().catch(() => {})
        setReady(true)
      } catch {
        if (!stop) onFail()
      }
    })()
    return () => {
      stop = true
      stream.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const shoot = async () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    let blob: Blob | null = null
    // 写真用の高い解像度で撮れる端末はそれで（ImageCapture）
    const track = stream.current?.getVideoTracks()[0]
    const IC = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { takePhoto: () => Promise<Blob> } }).ImageCapture
    if (track && IC) blob = await new IC(track).takePhoto().catch(() => null)
    if (!blob) {
      const c = document.createElement('canvas')
      c.width = v.videoWidth
      c.height = v.videoHeight
      c.getContext('2d')!.drawImage(v, 0, 0)
      blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.92))
    }
    if (blob) onShot(new File([blob], 'pills.jpg', { type: 'image/jpeg' }))
  }

  return (
    <div class="shot">
      <video ref={video} playsInline muted autoPlay class="shot-video" />
      {!ready && <div class="shot-msg">カメラを準備しています…</div>}
      <div class="shot-hint">錠剤を重ならないように広げ、真上から画面いっぱいに</div>
      <button class="shot-close" aria-label="閉じる" onClick={onClose}>
        <X size={26} />
      </button>
      <button class="shot-btn" aria-label="撮影する" disabled={!ready} onClick={shoot} />
    </div>
  )
}
