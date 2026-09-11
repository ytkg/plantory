#include <ArduinoOTA.h>
#include <ESPmDNS.h>
#include <WebServer.h>
#include <WiFi.h>
#include <driver/i2s.h>
#include <esp_camera.h>
#include <freertos/semphr.h>

#include "secrets.h"

namespace {
constexpr char HOSTNAME[] = "plantory-camera";
constexpr char FALLBACK_AP_NAME[] = "Plantory-Cam-Setup";
constexpr unsigned long WIFI_TIMEOUT_MS = 20000;
constexpr int MIN_BRIGHTNESS = 0;
constexpr int MAX_BRIGHTNESS = 8;
constexpr int DEFAULT_BRIGHTNESS = 4;
constexpr int AUDIO_SAMPLE_RATE = 16000;
constexpr int AUDIO_I2S_PORT = I2S_NUM_0;
constexpr int MIC_CLOCK_PIN = 47;
constexpr int MIC_DATA_PIN = 48;
constexpr int AUDIO_GAIN = 4;
constexpr framesize_t LIVE_FRAME_SIZE = FRAMESIZE_VGA;
constexpr int LIVE_JPEG_QUALITY = 10;
constexpr size_t MAX_LIVE_FRAME_BYTES = 192 * 1024;
constexpr uint8_t MAX_VIEWERS = 3;
constexpr unsigned long STREAM_REQUEST_TIMEOUT_MS = 1000;
constexpr unsigned long WIFI_RETRY_INTERVAL_MS = 5000;

WebServer server(80);
WiFiServer audioServer(81);
WiFiServer videoServer(82);
bool cameraReady = false;
int brightness = DEFAULT_BRIGHTNESS;
SemaphoreHandle_t cameraMutex = nullptr;
SemaphoreHandle_t streamMutex = nullptr;
uint8_t* liveFrameBuffer = nullptr;
size_t liveFrameLength = 0;
unsigned long lastWiFiRetryAt = 0;
bool mdnsRunning = false;

struct StreamClient {
  WiFiClient client;
  String viewerId;
  bool active = false;
};

StreamClient videoClients[MAX_VIEWERS];
StreamClient audioClients[MAX_VIEWERS];

bool initializeCamera() {
  Serial.println("Initializing camera...");
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = 6;
  config.pin_d1 = 15;
  config.pin_d2 = 16;
  config.pin_d3 = 7;
  config.pin_d4 = 5;
  config.pin_d5 = 10;
  config.pin_d6 = 4;
  config.pin_d7 = 13;
  config.pin_xclk = 11;
  config.pin_pclk = 12;
  config.pin_vsync = 42;
  config.pin_href = 18;
  config.pin_sccb_sda = 17;
  config.pin_sccb_scl = 41;
  config.pin_pwdn = -1;
  config.pin_reset = 21;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  // The live stream prioritizes responsiveness. A full 5 MP still is available
  // on demand without making the everyday preview sluggish.
  config.frame_size = LIVE_FRAME_SIZE;
  config.jpeg_quality = LIVE_JPEG_QUALITY;
  // This driver allocates 2592 * 1944 bytes per JPEG buffer, even at SVGA.
  // Two buffers exceed the device's 8 MB PSRAM.
  config.fb_count = 1;
  config.fb_location = CAMERA_FB_IN_PSRAM;
  config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;

  const esp_err_t result = esp_camera_init(&config);
  if (result != ESP_OK) {
    Serial.printf("Camera initialization failed: 0x%X\n", result);
    return false;
  }

  Serial.println("Camera initialized");
  return true;
}

bool initializeMicrophone() {
  const i2s_config_t config = {
      .mode = static_cast<i2s_mode_t>(I2S_MODE_MASTER | I2S_MODE_RX | I2S_MODE_PDM),
      .sample_rate = AUDIO_SAMPLE_RATE,
      .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
      // The Unit CamS3's PDM mic uses the right channel. Its clock is
      // connected to the I2S WS pin, rather than the BCK pin.
      .channel_format = I2S_CHANNEL_FMT_ONLY_RIGHT,
      .communication_format = I2S_COMM_FORMAT_I2S,
      .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
      .dma_buf_count = 8,
      .dma_buf_len = 256,
      .use_apll = false,
      .tx_desc_auto_clear = false,
      .fixed_mclk = 0,
  };
  const i2s_pin_config_t pins = {
      .bck_io_num = I2S_PIN_NO_CHANGE,
      .ws_io_num = MIC_CLOCK_PIN,
      .data_out_num = I2S_PIN_NO_CHANGE,
      .data_in_num = MIC_DATA_PIN,
  };

  const i2s_port_t port = static_cast<i2s_port_t>(AUDIO_I2S_PORT);
  if (i2s_driver_install(port, &config, 0, nullptr) != ESP_OK) {
    Serial.println("Microphone initialization failed");
    return false;
  }
  if (i2s_set_pin(port, &pins) != ESP_OK) {
    i2s_driver_uninstall(port);
    Serial.println("Microphone pin setup failed");
    return false;
  }

  Serial.println("Microphone initialized: 16 kHz mono");
  return true;
}

String readRequestLine(WiFiClient& client) {
  const unsigned long startedAt = millis();
  String requestLine = client.readStringUntil('\n');
  while (client.connected() && millis() - startedAt < STREAM_REQUEST_TIMEOUT_MS) {
    if (client.readStringUntil('\n') == "\r") break;
  }
  return requestLine;
}

String viewerIdFromRequest(const String& requestLine, const WiFiClient& client) {
  const int marker = requestLine.indexOf("viewer=");
  if (marker < 0) return client.remoteIP().toString() + "-legacy";
  String viewerId = requestLine.substring(marker + 7);
  const int end = viewerId.indexOf('&');
  if (end >= 0) viewerId.remove(end);
  const int space = viewerId.indexOf(' ');
  if (space >= 0) viewerId.remove(space);
  if (viewerId.length() == 0 || viewerId.length() > 40) return client.remoteIP().toString() + "-legacy";
  for (size_t index = 0; index < viewerId.length(); index++) {
    const char character = viewerId[index];
    if (!isAlphaNumeric(character) && character != '-' && character != '_') return client.remoteIP().toString() + "-legacy";
  }
  return viewerId;
}

bool viewerIsTracked(const String& viewerId) {
  for (uint8_t index = 0; index < MAX_VIEWERS; index++) {
    if ((videoClients[index].active && videoClients[index].viewerId == viewerId) ||
        (audioClients[index].active && audioClients[index].viewerId == viewerId)) return true;
  }
  return false;
}

uint8_t trackedViewerCount() {
  String viewerIds[MAX_VIEWERS * 2];
  uint8_t count = 0;
  for (uint8_t index = 0; index < MAX_VIEWERS * 2; index++) {
    StreamClient& client = index < MAX_VIEWERS ? videoClients[index] : audioClients[index - MAX_VIEWERS];
    if (!client.active) continue;
    bool seen = false;
    for (uint8_t previous = 0; previous < count; previous++) seen = seen || viewerIds[previous] == client.viewerId;
    if (!seen) viewerIds[count++] = client.viewerId;
  }
  return count;
}

bool viewerHasCapacity(const String& viewerId) {
  if (streamMutex == nullptr) return false;
  if (xSemaphoreTake(streamMutex, pdMS_TO_TICKS(100)) != pdTRUE) return false;
  if (viewerIsTracked(viewerId)) {
    xSemaphoreGive(streamMutex);
    return true;
  }
  const uint8_t viewers = trackedViewerCount();
  xSemaphoreGive(streamMutex);
  return viewers < MAX_VIEWERS;
}

bool registerStreamClient(StreamClient* clients, WiFiClient& client, const String& viewerId, const char* contentType) {
  if (streamMutex == nullptr) return false;
  if (xSemaphoreTake(streamMutex, pdMS_TO_TICKS(100)) != pdTRUE) return false;
  int slot = -1;
  for (uint8_t index = 0; index < MAX_VIEWERS; index++) {
    if (clients[index].active && clients[index].viewerId == viewerId) {
      clients[index].client.stop();
      slot = index;
      break;
    }
    if (slot < 0 && !clients[index].active) slot = index;
  }
  const bool permitted = viewerIsTracked(viewerId) || slot >= 0;
  if (!permitted || !viewerIsTracked(viewerId)) {
    const uint8_t viewers = trackedViewerCount();
    if (viewers >= MAX_VIEWERS) {
      xSemaphoreGive(streamMutex);
      client.print("HTTP/1.1 429 Too Many Requests\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\n\r\n接続上限です");
      client.stop();
      return false;
    }
  }
  if (slot < 0) {
    xSemaphoreGive(streamMutex);
    client.print("HTTP/1.1 429 Too Many Requests\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\n\r\n接続上限です");
    client.stop();
    return false;
  }
  client.setTimeout(1);
  client.setNoDelay(true);
  clients[slot].client = client;
  clients[slot].viewerId = viewerId;
  clients[slot].active = true;
  xSemaphoreGive(streamMutex);
  clients[slot].client.printf("HTTP/1.1 200 OK\r\nContent-Type: %s\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n", contentType);
  return true;
}

void clearStreamClient(StreamClient& client) {
  client.client.stop();
  if (streamMutex == nullptr) return;
  if (xSemaphoreTake(streamMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
    client.active = false;
    client.viewerId = "";
    xSemaphoreGive(streamMutex);
  }
}

void acceptStreamClients(WiFiServer& server, StreamClient* clients, const char* expectedPath, const char* contentType) {
  WiFiClient client = server.available();
  if (!client) return;
  const String requestLine = readRequestLine(client);
  if (!requestLine.startsWith(String("GET ") + expectedPath)) {
    client.print("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
    client.stop();
    return;
  }
  registerStreamClient(clients, client, viewerIdFromRequest(requestLine, client), contentType);
}

bool captureLiveFrame() {
  if (liveFrameBuffer == nullptr) return false;
  if (xSemaphoreTake(cameraMutex, pdMS_TO_TICKS(1000)) != pdTRUE) return false;
  camera_fb_t* frame = esp_camera_fb_get();
  if (frame == nullptr || frame->len > MAX_LIVE_FRAME_BYTES) {
    if (frame != nullptr) esp_camera_fb_return(frame);
    xSemaphoreGive(cameraMutex);
    Serial.println("Live frame unavailable or exceeds shared buffer");
    return false;
  }
  memcpy(liveFrameBuffer, frame->buf, frame->len);
  liveFrameLength = frame->len;
  esp_camera_fb_return(frame);
  xSemaphoreGive(cameraMutex);
  return true;
}

bool writeWithTimeout(WiFiClient& client, const uint8_t* data, size_t length) {
  const unsigned long startedAt = millis();
  while (length > 0 && client.connected()) {
    const size_t chunkLength = min(length, static_cast<size_t>(1024));
    if (client.write(data, chunkLength) != chunkLength || millis() - startedAt >= 1000) return false;
    data += chunkLength;
    length -= chunkLength;
  }
  return length == 0;
}

void videoStreamTask(void*) {
  while (true) {
    acceptStreamClients(videoServer, videoClients, "/stream.mjpg", "multipart/x-mixed-replace; boundary=frame");
    bool hasViewer = false;
    for (uint8_t index = 0; index < MAX_VIEWERS; index++) hasViewer = hasViewer || videoClients[index].active;
    if (!hasViewer || !captureLiveFrame()) {
      vTaskDelay(pdMS_TO_TICKS(20));
      continue;
    }
    for (uint8_t index = 0; index < MAX_VIEWERS; index++) {
      StreamClient& viewer = videoClients[index];
      if (!viewer.active) continue;
      const String header = String("--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ") + liveFrameLength + "\r\n\r\n";
      if (!writeWithTimeout(viewer.client, reinterpret_cast<const uint8_t*>(header.c_str()), header.length()) ||
          !writeWithTimeout(viewer.client, liveFrameBuffer, liveFrameLength) ||
          !writeWithTimeout(viewer.client, reinterpret_cast<const uint8_t*>("\r\n"), 2)) clearStreamClient(viewer);
    }
    vTaskDelay(pdMS_TO_TICKS(1));
  }
}

void audioStreamTask(void*) {
  int16_t samples[512];
  while (true) {
    acceptStreamClients(audioServer, audioClients, "/audio.pcm", "application/octet-stream");
    bool hasViewer = false;
    for (uint8_t index = 0; index < MAX_VIEWERS; index++) hasViewer = hasViewer || audioClients[index].active;
    if (!hasViewer) {
      vTaskDelay(pdMS_TO_TICKS(20));
      continue;
    }
    size_t bytesRead = 0;
    if (i2s_read(static_cast<i2s_port_t>(AUDIO_I2S_PORT), samples, sizeof(samples), &bytesRead, portMAX_DELAY) != ESP_OK || bytesRead == 0) continue;
    for (size_t index = 0; index < bytesRead / sizeof(samples[0]); index++) samples[index] = static_cast<int16_t>(constrain(static_cast<int>(samples[index]) * AUDIO_GAIN, -32768, 32767));
    for (uint8_t index = 0; index < MAX_VIEWERS; index++) {
      StreamClient& viewer = audioClients[index];
      if (viewer.active && !writeWithTimeout(viewer.client, reinterpret_cast<const uint8_t*>(samples), bytesRead)) clearStreamClient(viewer);
    }
  }
}

void showCameraPage() {
  if (!cameraReady) {
    server.send(503, "text/plain; charset=utf-8", "Camera initialization failed. OTA remains available on home Wi-Fi; check the serial log.");
    return;
  }
  server.send(200, "text/html; charset=utf-8", R"HTML(<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plantory Camera</title>
<style>body{margin:0;background:#111;color:#fff;font-family:system-ui;text-align:center}img{display:block;width:100%;height:auto;max-width:1280px;margin:auto}p{padding:12px;margin:0}input{width:min(320px,80vw)}button,a{padding:.6rem 1rem;border:0;border-radius:.5rem;font:inherit}a{color:#fff}.status{font-size:.9rem;color:#bbb}</style>
<img id="camera" alt="Plantory camera preview"><p>Plantory Camera · ライブ映像<br><span id="video-status" class="status">接続中…</span></p>
<p><a href="/capture?full=1" target="_blank">5MPの写真を開く</a></p>
<p><label>明るさ <output id="brightness-value">0</output><br><input id="brightness" type="range" min="0" max="8" value="4"></label></p>
<p><button id="audio-toggle" type="button">ライブ音声を再生</button> <label>音量 <input id="audio-volume" type="range" min="0" max="2" step="0.1" value="1"></label><br><span id="audio-status">停止中</span></p>
<script>
const image=document.getElementById('camera'),videoStatus=document.getElementById('video-status'),brightness=document.getElementById('brightness'),value=document.getElementById('brightness-value'),audioButton=document.getElementById('audio-toggle'),audioVolume=document.getElementById('audio-volume'),audioStatus=document.getElementById('audio-status');
const viewerId=sessionStorage.plantoryCameraViewer||(sessionStorage.plantoryCameraViewer=(crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)).replace(/[^a-zA-Z0-9_-]/g,''));
const streamUrl='http://'+location.hostname+':82/stream.mjpg?viewer='+viewerId,audioUrl='http://'+location.hostname+':81/audio.pcm?viewer='+viewerId;
const label=()=>value.textContent=Number(brightness.value)-4;label();brightness.addEventListener('input',()=>{label();fetch('/settings/brightness?value='+brightness.value)});
async function reconnectVideo(){try{const status=await fetch('/stream-status?viewer='+viewerId,{cache:'no-store'});const state=await status.json();videoStatus.textContent=state.available?'映像を再接続中…':'接続上限です。空きができたら自動で再試行します。'}catch(_){videoStatus.textContent='映像を再接続中…'}setTimeout(startVideo,2000)}
function startVideo(){image.src=streamUrl+'&t='+Date.now()}image.onload=()=>videoStatus.textContent='ライブ映像';image.onerror=reconnectVideo;startVideo();
let audioContext,audioGain,audioAbort,nextAudioTime=0,oddByte=null,audioRequested=false;
audioVolume.addEventListener('input',()=>{if(audioGain)audioGain.gain.value=Number(audioVolume.value)});
function scheduleAudio(bytes){if(!audioContext||!audioGain)return;if(oddByte!==null){const merged=new Uint8Array(bytes.length+1);merged[0]=oddByte;merged.set(bytes,1);bytes=merged;oddByte=null}if(bytes.length%2){oddByte=bytes[bytes.length-1];bytes=bytes.slice(0,-1)}if(!bytes.length)return;const samples=new Int16Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/2),buffer=audioContext.createBuffer(1,samples.length,16000),channel=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)channel[i]=samples[i]/32768;const source=audioContext.createBufferSource();source.buffer=buffer;source.connect(audioGain);const now=audioContext.currentTime;if(nextAudioTime<now)nextAudioTime=now+.08;source.start(nextAudioTime);nextAudioTime+=buffer.duration}
async function startAudio(){if(!audioRequested||audioAbort)return;try{if(!audioContext){audioContext=new AudioContext();audioGain=audioContext.createGain();audioGain.gain.value=Number(audioVolume.value);audioGain.connect(audioContext.destination)}await audioContext.resume();audioAbort=new AbortController();nextAudioTime=audioContext.currentTime+.12;oddByte=null;audioButton.textContent='音声を停止';audioStatus.textContent='接続中…';const response=await fetch(audioUrl,{signal:audioAbort.signal,cache:'no-store'});if(response.status===429)throw new Error('limit');if(!response.ok||!response.body)throw new Error('stream');audioStatus.textContent='ライブ再生中';const reader=response.body.getReader();while(!audioAbort.signal.aborted){const {value,done}=await reader.read();if(done)break;scheduleAudio(value)}}catch(error){if(audioRequested){audioStatus.textContent=error.message==='limit'?'接続上限です。空きができたら自動で再試行します。':'音声を再接続中…';setTimeout(startAudio,2000)}}finally{audioAbort=null}}
function stopAudio(){audioRequested=false;if(audioAbort)audioAbort.abort();audioAbort=null;if(audioContext)audioContext.close();audioContext=null;audioGain=null;audioButton.textContent='ライブ音声を再生';audioStatus.textContent='停止中'}
audioButton.addEventListener('click',()=>{if(audioRequested)stopAudio();else{audioRequested=true;startAudio()}});
</script>
)HTML");
}

void sendStreamStatus() {
  const String viewerId = server.arg("viewer");
  const bool available = viewerId.length() > 0 && viewerHasCapacity(viewerId);
  server.send(200, "application/json", String("{\"available\":") + (available ? "true" : "false") + "}");
}

bool applyBrightness(int value) {
  if (cameraMutex != nullptr && xSemaphoreTake(cameraMutex, pdMS_TO_TICKS(1000)) != pdTRUE) {
    return false;
  }
  sensor_t* sensor = esp_camera_sensor_get();
  const bool applied = sensor != nullptr && sensor->set_brightness != nullptr && sensor->set_brightness(sensor, value) == 0;
  if (cameraMutex != nullptr) {
    xSemaphoreGive(cameraMutex);
  }
  if (!applied) {
    return false;
  }
  brightness = value;
  return true;
}

void setBrightness() {
  if (!cameraReady) {
    server.send(503, "text/plain", "Camera unavailable");
    return;
  }
  if (!server.hasArg("value")) {
    server.send(400, "text/plain", "Missing brightness value");
    return;
  }

  const int value = server.arg("value").toInt();
  if (value < MIN_BRIGHTNESS || value > MAX_BRIGHTNESS) {
    server.send(400, "text/plain", "Brightness must be between -4 and +4");
    return;
  }
  if (!applyBrightness(value)) {
    server.send(500, "text/plain", "Could not set brightness");
    return;
  }
  server.send(200, "application/json", String("{\"brightness\":") + (brightness - DEFAULT_BRIGHTNESS) + "}");
}

void sendCapture() {
  if (!cameraReady) {
    server.send(503, "text/plain", "Camera unavailable");
    return;
  }
  if (xSemaphoreTake(cameraMutex, pdMS_TO_TICKS(1000)) != pdTRUE) {
    server.send(503, "text/plain", "Camera is busy");
    return;
  }

  const bool fullResolution = server.arg("full") == "1";
  sensor_t* sensor = esp_camera_sensor_get();
  if (fullResolution && (sensor == nullptr || sensor->set_framesize(sensor, FRAMESIZE_5MP) != 0)) {
    if (sensor != nullptr) {
      sensor->set_framesize(sensor, LIVE_FRAME_SIZE);
      sensor->set_quality(sensor, LIVE_JPEG_QUALITY);
    }
    xSemaphoreGive(cameraMutex);
    server.send(500, "text/plain", "Could not enable 5 MP capture");
    return;
  }

  if (fullResolution) {
    // The camera completes the resolution change after its current frame.
    // Discard that stale VGA frame so this request reliably returns 5 MP.
    delay(100);
    camera_fb_t* staleFrame = esp_camera_fb_get();
    if (staleFrame != nullptr) {
      esp_camera_fb_return(staleFrame);
    }
  }

  camera_fb_t* frame = esp_camera_fb_get();
  if (!frame) {
    if (fullResolution) {
      sensor->set_framesize(sensor, LIVE_FRAME_SIZE);
    }
    xSemaphoreGive(cameraMutex);
    server.send(503, "text/plain", "Camera capture failed");
    return;
  }
  server.setContentLength(frame->len);
  server.send(200, "image/jpeg", "");
  server.client().write(frame->buf, frame->len);
  esp_camera_fb_return(frame);
  if (fullResolution) {
    sensor->set_framesize(sensor, LIVE_FRAME_SIZE);
    sensor->set_quality(sensor, LIVE_JPEG_QUALITY);
  }
  xSemaphoreGive(cameraMutex);
}

void startNetworkServices() {
  if (mdnsRunning || WiFi.status() != WL_CONNECTED) return;
  if (!MDNS.begin(HOSTNAME)) {
    Serial.println("mDNS initialization failed");
    return;
  }
  mdnsRunning = true;
  ArduinoOTA.setHostname(HOSTNAME);
  ArduinoOTA.begin();
  Serial.printf("Camera: http://%s.local/\n", HOSTNAME);
  Serial.printf("IP: http://%s/\n", WiFi.localIP().toString().c_str());
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(HOSTNAME);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  const unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < WIFI_TIMEOUT_MS) {
    delay(250);
  }

  if (WiFi.status() == WL_CONNECTED) {
    startNetworkServices();
    return;
  }

  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(FALLBACK_AP_NAME);
  Serial.printf("Wi-Fi connection failed. Setup AP: %s\n", FALLBACK_AP_NAME);
  Serial.printf("Camera: http://%s/\n", WiFi.softAPIP().toString().c_str());
}

void maintainWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    startNetworkServices();
    return;
  }
  if (mdnsRunning) {
    MDNS.end();
    mdnsRunning = false;
    Serial.println("Wi-Fi disconnected; mDNS stopped");
  }
  if (millis() - lastWiFiRetryAt < WIFI_RETRY_INTERVAL_MS) return;
  lastWiFiRetryAt = millis();
  Serial.println("Wi-Fi disconnected; retrying");
  WiFi.reconnect();
}
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println("Plantory Camera starting");

  connectWiFi();
  Serial.printf("PSRAM: total=%u free=%u bytes\n", ESP.getPsramSize(), ESP.getFreePsram());
  cameraReady = initializeCamera();
  if (cameraReady) {
    cameraMutex = xSemaphoreCreateMutex();
    streamMutex = xSemaphoreCreateMutex();
    liveFrameBuffer = static_cast<uint8_t*>(ps_malloc(MAX_LIVE_FRAME_BYTES));
    if (cameraMutex == nullptr || streamMutex == nullptr || liveFrameBuffer == nullptr) {
      Serial.println("Camera streaming memory initialization failed");
      cameraReady = false;
    }
  }
  if (cameraReady) {
    applyBrightness(DEFAULT_BRIGHTNESS);
  }
  server.on("/", HTTP_GET, showCameraPage);
  server.on("/capture", HTTP_GET, sendCapture);
  server.on("/settings/brightness", HTTP_GET, setBrightness);
  server.on("/stream-status", HTTP_GET, sendStreamStatus);
  server.begin();
  if (cameraReady) {
    videoServer.begin();
    xTaskCreatePinnedToCore(videoStreamTask, "video-stream", 4096, nullptr, 1, nullptr, 0);
  }
  if (cameraReady && initializeMicrophone()) {
    audioServer.begin();
    xTaskCreatePinnedToCore(audioStreamTask, "audio-stream", 4096, nullptr, 1, nullptr, 0);
  }
}

void loop() {
  maintainWiFi();
  if (WiFi.status() == WL_CONNECTED) ArduinoOTA.handle();
  server.handleClient();
}
