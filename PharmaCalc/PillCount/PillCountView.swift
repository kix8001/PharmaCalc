import PhotosUI
import SwiftUI
import UIKit

struct PillCountView: View {
    @State private var prepared: PreparedImage?
    @State private var markers: [PillMarker] = []
    @State private var radius: CGFloat = 12
    @State private var sensitivity = 0.5
    @State private var busy = false
    @State private var showCamera = false
    @State private var photoItem: PhotosPickerItem?
    @State private var expected = ""

    private var total: Int { markers.reduce(0) { $0 + $1.count } }

    var body: some View {
        Form {
            Section {
                Button {
                    showCamera = true
                } label: {
                    Label("撮影する", systemImage: "camera")
                }
                PhotosPicker(selection: $photoItem, matching: .images) {
                    Label("写真から選ぶ", systemImage: "photo")
                }
            } footer: {
                Text("黒っぽい無地の紙やトレーの上に、錠剤どうしを少し離して並べ、真上から撮ってください。白い錠剤は黒い背景、色の濃い錠剤は白い背景が向いています。")
            }

            if let prepared {
                Section {
                    ZStack {
                        MarkedImageView(image: prepared.image, markers: $markers, radius: radius)
                        if busy {
                            ProgressView().controlSize(.large)
                        }
                    }
                    .listRowInsets(EdgeInsets())
                } footer: {
                    Text("緑の丸が自動で数えた錠剤です。丸をタップすると1つ減り、印のない錠剤をタップすると追加します（青の丸）。オレンジの数字は、くっついた錠剤をまとめて数えたものです。")
                }

                Section("結果") {
                    ResultRow(title: "錠数", value: "\(total)", unit: "錠", color: .orange)
                    NumField(title: "予定数（任意）", text: $expected, unit: "錠", integer: true)
                    if let e = parseInt(expected), e > 0 {
                        if e == total {
                            Label("予定数と一致しています", systemImage: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                        } else {
                            WarningRow(total > e ? "予定より\(total - e)錠多い" : "予定より\(e - total)錠足りない")
                        }
                    }
                }

                Section {
                    Slider(value: $sensitivity, in: 0...1) {
                        Text("感度")
                    } minimumValueLabel: {
                        Text("低")
                    } maximumValueLabel: {
                        Text("高")
                    } onEditingChanged: { editing in
                        if !editing { analyze() }
                    }
                    Button("自動で数え直す") { analyze() }
                    Button("印をすべて消す", role: .destructive) { markers.removeAll() }
                } header: {
                    Text("感度")
                } footer: {
                    Text("背景の模様や影を錠剤と間違えるときは感度を下げ、薄い色の錠剤を見落とすときは上げてください。")
                }
            }
        }
        .calcForm("錠剤カウント")
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { load($0) }
                .ignoresSafeArea()
        }
        .onChange(of: photoItem) { item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self),
                   let img = UIImage(data: data) {
                    load(img)
                }
            }
        }
    }

    private func load(_ img: UIImage) {
        busy = true
        markers = []
        Task.detached(priority: .userInitiated) {
            let p = PreparedImage.make(from: img)
            await MainActor.run {
                prepared = p
                if p == nil { busy = false } else { analyze() }
            }
        }
    }

    private func analyze() {
        guard let p = prepared else { return }
        busy = true
        let s = sensitivity
        Task.detached(priority: .userInitiated) {
            let r = PillCounter.analyze(p, sensitivity: s)
            await MainActor.run {
                markers = r.markers
                radius = r.unitRadius
                busy = false
            }
        }
    }
}

/// 写真の上に印を重ねて表示し、タップで印を足し引きする
struct MarkedImageView: View {
    let image: UIImage
    @Binding var markers: [PillMarker]
    /// 錠剤1つの半径（画像の画素）
    let radius: CGFloat

    var body: some View {
        GeometryReader { geo in
            let s = geo.size.width / max(image.size.width, 1)
            let r = min(max(radius * s, 8), 40)
            ZStack(alignment: .topLeading) {
                Image(uiImage: image)
                    .resizable()
                    .frame(width: geo.size.width, height: geo.size.height)
                ForEach(markers) { m in
                    ZStack {
                        Circle()
                            .stroke(m.manual ? Color.blue : Color.green, lineWidth: 2.5)
                            .frame(width: r * 2, height: r * 2)
                        if m.count > 1 {
                            Text("\(m.count)")
                                .font(.caption.bold())
                                .foregroundStyle(.white)
                                .padding(4)
                                .background(Circle().fill(Color.orange))
                        }
                    }
                    .position(x: m.x * s, y: m.y * s)
                }
            }
            .contentShape(Rectangle())
            .onTapGesture(coordinateSpace: .local) { p in
                tap(p, scale: s, r: r)
            }
        }
        .aspectRatio(image.size.width / max(image.size.height, 1), contentMode: .fit)
    }

    private func tap(_ p: CGPoint, scale s: CGFloat, r: CGFloat) {
        guard s > 0 else { return }
        let ix = p.x / s, iy = p.y / s
        func d(_ i: Int) -> CGFloat { hypot(markers[i].x - ix, markers[i].y - iy) }
        if let i = markers.indices.min(by: { d($0) < d($1) }), d(i) * s <= max(r, 14) {
            if markers[i].count > 1 {
                markers[i].count -= 1
            } else {
                markers.remove(at: i)
            }
        } else {
            markers.append(PillMarker(x: ix, y: iy, count: 1, manual: true))
        }
    }
}

/// カメラで1枚撮る
struct CameraPicker: UIViewControllerRepresentable {
    var onImage: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let p = UIImagePickerController()
        p.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        p.delegate = context.coordinator
        return p
    }

    func updateUIViewController(_ vc: UIImagePickerController, context: Context) {}

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let img = info[.originalImage] as? UIImage { parent.onImage(img) }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}
