import Foundation
import Vision
import ImageIO
for path in CommandLine.arguments.dropFirst() {
 let request=VNDetectBarcodesRequest()
 request.symbologies=[.qr]
 do { try VNImageRequestHandler(url:URL(fileURLWithPath:path)).perform([request]); let values=(request.results ?? []).compactMap{$0.payloadStringValue}; let value:[String:Any] = ["file":URL(fileURLWithPath:path).lastPathComponent,"qr":values]; let bytes=try JSONSerialization.data(withJSONObject:value,options:[.sortedKeys]); print(String(data:bytes,encoding:.utf8)!) } catch { print("DECODE_FAILED") }
}
