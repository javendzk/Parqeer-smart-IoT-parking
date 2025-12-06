/*
 * Parqeer Smart IoT Parking System - ESP32 Main Program (MQTT HiveMQ Version)
 * 
 * Features:
 * - 4 IR Sensors for parking slot detection (4 slots)
 * - 1 Servo motor for entrance gate control
 * - 4x4 Keypad for voucher input
 * - 1 LED Indicator for reserved slot tracking
 * - 1 Buzzer for wrong slot detection
 * - WiFi connectivity to Backend API + MQTT HiveMQ Cloud
 * 
 * Hardware Pinout (Final - Safe for ESP32):
 * 
 * IR Sensors (Active LOW = Object detected)
 *   Slot 1 → GPIO 18
 *   Slot 2 → GPIO 19
 *   Slot 3 → GPIO 21
 *   Slot 4 → GPIO 22
 * 
 * Servo Motor (PWM supported pins)
 *   Entrance Gate → GPIO 26
 * 
 * LED Indicator Pin
 *   Indicator LED → GPIO 2 (lights up when voucher valid, turns off when vehicle arrives at correct slot)
 * 
 * Buzzer Pin
 *   Buzzer → GPIO 4 (beeps when vehicle enters wrong slot)
 * 
 * Keypad 4x4 (Matrix)
 *   Rows → GPIO 32, 25, 4, 5
 *   Cols → GPIO 14, 27, 33, 26
 * 
 * LED Logic:
 * - LED ON: Immediately when voucher is validated (vehicle should be entering)
 * - LED OFF: Automatically turns off when reserved slot sensor detects vehicle (occupied)
 * - LED Log: Every LED state change is logged with timestamp and reason
 * - MQTT: LED events published to "parking/led/log" topic for backend tracking
 * 
 * Buzzer Logic:
 * - BUZZER ON: When vehicle sensor detects occupancy in a slot OTHER than reserved slot
 * - BUZZER OFF: When vehicle enters the CORRECT reserved slot
 * - BUZZER PAUSED: When vehicle leaves wrong slot (buzzer stays on, waiting for correct slot)
 * - MQTT: Buzzer events published to "parking/buzzer/log" topic for backend tracking
 * 
 * Example Scenario:
 * 1. User reserves Slot 2 → Voucher validated → Gate opens → LED ON
 * 2. Vehicle enters Slot 3 instead → Sensor detects → BUZZER ON
 * 3. Vehicle leaves Slot 3 → BUZZER stays ON (paused state)
 * 4. Vehicle enters Slot 2 → Sensor detects → LED OFF, BUZZER OFF, Gate closes
 * 
 * Notes:
 * - All GND must be COMMON Ground
 * - Supply servo with external 5V if powerful servo is used
 * - MQTT Broker: HiveMQ Cloud (TLS on port 8883)
 * - Designed to work with backend base path `/api/v1`
 *    validate voucher → /api/v1/iot/validate
 *    update sensor   → /api/v1/iot/sensor-update
 *    servo callback  → /api/v1/iot/servo-callback
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <ESP32Servo.h>
#include <Keypad.h>
#include <ArduinoJson.h>

// ======== FreeRTOS (Task Management) ========
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

// ==================== CONFIGURATION ====================

// WiFi Credentials
#define WIFI_SSID "Wifi EROR"
#define WIFI_PASSWORD "nggaktau"

// MQTT HiveMQ Cloud Configuration
#define MQTT_BROKER "13b2db0db2624442893404a69ca826a1.s1.eu.hivemq.cloud"
#define MQTT_PORT 8883
#define MQTT_USERNAME "parqeer-service"
#define MQTT_PASSWORD "Parqeer1"

// Backend API Configuration
#define BACKEND_API_BASE "https://parqeer-smart-iot-parking-production.up.railway.app/api/v1"
#define DEVICE_TOKEN "parqeer-device-8f2d1c7b4a"

// ==================== HARDWARE PINS ====================

// IR Sensor Pins (Active LOW - detects obstacle)
const int irSensorPins[4] = {18, 19, 21, 22};

// Entrance Gate Servo Motor Pin
const int gateServoPin = 26;  // Changed from 26 to avoid keypad conflict

// Wrong-slot indicator LED Pin
const int indicatorLedPin = 2;

// Buzzer Pin
const int buzzerPin = 23;

// Servo Positions
const int SERVO_CLOSED = 90;
const int SERVO_OPEN = 0;

// Keypad Configuration
const byte ROWS = 4;
const byte COLS = 4;
char keys[ROWS][COLS] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'}
};
byte rowPins[ROWS] = {32, 25, 4, 5};
byte colPins[COLS] = {14, 27, 33};

// ==================== OBJECTS ====================

WiFiClientSecure wifiClient;
PubSubClient mqttClient(wifiClient);
Servo gateServo;
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

// ==================== VARIABLES ====================

String voucherCode = "";
bool sensorStates[4] = {false, false, false, false};
unsigned long lastSensorCheck[4] = {0, 0, 0, 0};
unsigned long lastMqttReconnect = 0;

const unsigned long SENSOR_DEBOUNCE = 2000;
const unsigned long MQTT_RECONNECT_INTERVAL = 5000;
const unsigned long SERVO_AUTO_CLOSE_DELAY = 5000;
const int VOUCHER_LENGTH = 6;

bool gateServoOpen = false;
unsigned long gateServoOpenTime = 0;
bool indicatorLedOn = false;

// LED Tracking variables
int reservedSlotNumber = -1;           // -1 = tidak ada slot reserved
unsigned long ledTurnedOnTime = 0;     // Waktu LED dinyalakan
bool ledActiveForReservedSlot = false; // Apakah LED sedang aktif untuk slot reserved

// Buzzer Tracking variables
bool buzzerActive = false;             // Apakah buzzer sedang aktif
unsigned long buzzerActivationTime = 0; // Waktu buzzer dinyalakan

// ==================== TASK MANAGEMENT ====================

// Task handles
TaskHandle_t taskWifiMqttHandle        = NULL;
TaskHandle_t taskKeypadHandle         = NULL;
TaskHandle_t taskSensorsHandle        = NULL;
TaskHandle_t taskGateHandle           = NULL;
TaskHandle_t taskPowerMemoryHandle    = NULL;

// Memory management variables (no Serial print, hanya monitoring)
volatile size_t currentFreeHeap = 0;
volatile size_t minFreeHeap     = 0;

// Forward declaration task functions
void TaskWifiMqtt(void *pvParameters);
void TaskKeypad(void *pvParameters);
void TaskSensors(void *pvParameters);
void TaskGate(void *pvParameters);
void TaskPowerMemory(void *pvParameters);

// Forward declaration existing functions (supaya jelas untuk compiler)
void connectWiFi();
void reconnectMQTT();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void handleKeypadInput();
void checkAllSensors();
void handleAutoCloseGate();
void validateVoucher(String code);
void checkSensor(int index);
void sendSensorUpdate(int slotNumber, String status);
void openGate();
void closeGate();
void sendServoCallback(String state);
void logLedEvent(String state, int slotNumber, String reason);
void logBuzzerEvent(String state, int slotNumber, String reason);
void blinkSuccess();
void blinkError();

// ==================== SETUP ====================

void setup() {
  Serial.begin(115200);
  Serial.println("\n=== Parqeer Smart Parking System (MQTT) ===");
  
  // Turunkan frekuensi CPU untuk power management (tidak mengubah algoritma)
  setCpuFrequencyMhz(80);

  // Initialize IR Sensors
  for (int i = 0; i < 4; i++) {
    pinMode(irSensorPins[i], INPUT_PULLUP);
  }
  Serial.println("✓ IR Sensors initialized");
  
  // Initialize Gate Servo
  gateServo.attach(gateServoPin);
  gateServo.write(SERVO_CLOSED);
  Serial.println("✓ Gate servo initialized");

  pinMode(indicatorLedPin, OUTPUT);
  digitalWrite(indicatorLedPin, LOW);
  indicatorLedOn = false;
  
  // Initialize Buzzer
  pinMode(buzzerPin, OUTPUT);
  digitalWrite(buzzerPin, LOW);
  buzzerActive = false;
  Serial.println("✓ Buzzer initialized");
  
  // Connect to WiFi
  connectWiFi();
  
  // Setup MQTT
  wifiClient.setInsecure();
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  
  // Initial sensor readings
  checkAllSensors();
  
  Serial.println("=== System Ready ===\n");

  // Inisialisasi nilai awal memory management
  currentFreeHeap = ESP.getFreeHeap();
  minFreeHeap     = currentFreeHeap;

  // ==================== CREATE RTOS TASKS ====================
  // Task WiFi + MQTT (Core 0)
xTaskCreatePinnedToCore(TaskWifiMqtt, "TaskWifiMqtt", 8192, NULL, 3, &taskWifiMqttHandle, 0);

// Task Keypad (Core 1)
xTaskCreatePinnedToCore(TaskKeypad, "TaskKeypad", 6144, NULL, 2, &taskKeypadHandle, 1);

// Task Sensors (Core 1)
xTaskCreatePinnedToCore(TaskSensors, "TaskSensors", 6144, NULL, 2, &taskSensorsHandle, 1);

// Task Gate (Core 1)
xTaskCreatePinnedToCore(TaskGate, "TaskGate", 4096, NULL, 1, &taskGateHandle, 1);

// Task Power + Memory (Core 0)
xTaskCreatePinnedToCore(TaskPowerMemory, "TaskPowerMemory", 4096, NULL, 1, &taskPowerMemoryHandle, 0);

}

// ==================== MAIN LOOP ====================
// Algoritma utama sekarang dijalankan di RTOS Tasks.
// Loop hanya idle supaya kompatibel dengan Arduino.
void loop() {
  vTaskDelay(1000 / portTICK_PERIOD_MS);
}

// ==================== RTOS TASK IMPLEMENTATIONS ====================

void TaskWifiMqtt(void *pvParameters) {
  (void) pvParameters;
  for (;;) {
    // Bagian ini tadinya di loop(): WiFi + MQTT
    if (WiFi.status() != WL_CONNECTED) {
      connectWiFi();
    }

    if (!mqttClient.connected()) {
      if (millis() - lastMqttReconnect > MQTT_RECONNECT_INTERVAL) {
        reconnectMQTT();
        lastMqttReconnect = millis();
      }
    } else {
      mqttClient.loop();
    }

    vTaskDelay(10 / portTICK_PERIOD_MS); // sering, supaya MQTT responsif
  }
}

void TaskKeypad(void *pvParameters) {
  (void) pvParameters;
  for (;;) {
    // Tadinya di loop(): handleKeypadInput
    handleKeypadInput();
    vTaskDelay(20 / portTICK_PERIOD_MS);
  }
}

void TaskSensors(void *pvParameters) {
  (void) pvParameters;
  for (;;) {
    // Tadinya di loop(): checkAllSensors
    checkAllSensors();
    vTaskDelay(50 / portTICK_PERIOD_MS);
  }
}

void TaskGate(void *pvParameters) {
  (void) pvParameters;
  for (;;) {
    // Tadinya di loop(): handleAutoCloseGate
    handleAutoCloseGate();
    vTaskDelay(50 / portTICK_PERIOD_MS);
  }
}

void TaskPowerMemory(void *pvParameters) {
  (void) pvParameters;
  for (;;) {
    // Memory management: pantau heap (tanpa mengubah Serial output)
    currentFreeHeap = ESP.getFreeHeap();
    if (currentFreeHeap < minFreeHeap) {
      minFreeHeap = currentFreeHeap;
    }

    // Power management tambahan bisa ditaruh di sini (tanpa Serial):
    // misalnya: logika kalau idle lama -> bisa matikan beberapa peripheral, dsb.
    // Di sini kita biarkan ringan saja, cukup modem sleep dan CPU freq di-setup.

    vTaskDelay(5000 / portTICK_PERIOD_MS); // cek tiap 5 detik
  }
}

// ==================== WIFI CONNECTION ====================

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }
  
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✓ WiFi connected");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());

    // Power management: aktifkan WiFi modem-sleep
    WiFi.setSleep(true);
  } else {
    Serial.println("\n✗ WiFi connection failed!");
  }
}

// ==================== MQTT CONNECTION ====================

void reconnectMQTT() {
  if (!WiFi.isConnected()) {
    Serial.println("WiFi not connected, skipping MQTT reconnect");
    return;
  }
  
  Serial.print("Attempting MQTT connection to ");
  Serial.println(MQTT_BROKER);
  
  if (mqttClient.connect("ESP32-Parqeer", MQTT_USERNAME, MQTT_PASSWORD)) {
    Serial.println("✓ MQTT connected!");
    
    mqttClient.subscribe("parking/gate/open");
    mqttClient.subscribe("parking/gate/close");
    mqttClient.subscribe("parking/indicator/wrong-slot");
    Serial.println("✓ Subscribed to: parking/gate/open");
    Serial.println("✓ Subscribed to: parking/gate/close");
    Serial.println("✓ Subscribed to: parking/indicator/wrong-slot");
  } else {
    Serial.print("✗ MQTT connection failed, rc=");
    Serial.println(mqttClient.state());
  }
}

// ==================== MQTT CALLBACK ====================

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  
  Serial.print("MQTT message received on topic: ");
  Serial.println(topic);
  Serial.print("Payload: ");
  Serial.println(message);
  
  String topicStr = String(topic);
  bool isOpenTopic = topicStr == "parking/gate/open";
  bool isCloseTopic = topicStr == "parking/gate/close";
  bool isIndicatorTopic = topicStr == "parking/indicator/wrong-slot";

  if (isIndicatorTopic) {
    StaticJsonDocument<200> doc;
    DeserializationError error = deserializeJson(doc, message);
    if (error) {
      Serial.print("✗ Failed to parse indicator JSON: ");
      Serial.println(error.c_str());
      return;
    }
    String state = doc["state"] | "off";
    bool turnOn = state == "on" || doc["on"] == true;
    digitalWrite(indicatorLedPin, turnOn ? HIGH : LOW);
    indicatorLedOn = turnOn;
    Serial.print("Indicator LED ");
    Serial.println(turnOn ? "ON" : "OFF");
    return;
  }

  if (isOpenTopic || isCloseTopic) {
    StaticJsonDocument<200> doc;
    DeserializationError error = deserializeJson(doc, message);
    if (error) {
      Serial.print("✗ Failed to parse gate command JSON: ");
      Serial.println(error.c_str());
      return;
    }

    int slotNumber = doc["slotNumber"] | 0;
    String command = doc["command"] | String(isOpenTopic ? "open" : "close");

    if (slotNumber < 1 || slotNumber > 4) {
      Serial.println("✗ Invalid slot number in gate command");
      return;
    }

    if (command == "open") {
      Serial.print("Opening entrance gate for slot ");
      Serial.println(slotNumber);
      openGate();
    } else if (command == "close") {
      Serial.print("Closing entrance gate for slot ");
      Serial.println(slotNumber);
      closeGate();
    } else {
      Serial.print("✗ Unknown gate command: ");
      Serial.println(command);
    }
  }
}

// ==================== KEYPAD HANDLING ====================

void handleKeypadInput() {
  char key = keypad.getKey();
  
  if (key) {
    Serial.print("Key pressed: ");
    Serial.println(key);
    
    if (key == '#') {
      if (voucherCode.length() == VOUCHER_LENGTH) {
        Serial.print("Validating voucher: ");
        Serial.println(voucherCode);
        validateVoucher(voucherCode);
      } else {
        Serial.println("Invalid voucher length!");
        blinkError();
      }
      voucherCode = "";
    } 
    else if (key == '*') {
      voucherCode = "";
      Serial.println("Voucher cleared");
    }
    else if ((key >= '0' && key <= '9') || (key >= 'A' && key <= 'D')) {
      if (voucherCode.length() < VOUCHER_LENGTH) {
        voucherCode += key;
        Serial.print("Voucher: ");
        Serial.println(voucherCode);
      }
    }
  }
}

// ==================== VOUCHER VALIDATION ====================

void validateVoucher(String code) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected!");
    blinkError();
    return;
  }
  
  HTTPClient http;
  String url = String(BACKEND_API_BASE) + "/iot/validate";
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-token", DEVICE_TOKEN);
  
  StaticJsonDocument<200> doc;
  doc["code"] = code;
  doc["deviceId"] = "esp32-main";
  
  String payload;
  serializeJson(doc, payload);
  Serial.print("POST ");
  Serial.print(url);
  Serial.print(" payload: ");
  Serial.println(payload);
  
  Serial.println("Sending validation request...");
  int httpCode = http.POST(payload);
  
  if (httpCode > 0) {
    String response = http.getString();
    Serial.print("Response code: ");
    Serial.println(httpCode);
    Serial.print("Response: ");
    Serial.println(response);
    
    if (httpCode == 200) {
      StaticJsonDocument<200> responseDoc;
      DeserializationError error = deserializeJson(responseDoc, response);
      
      if (!error) {
        bool valid = responseDoc["valid"];
        
        if (valid) {
          int slotNumber = responseDoc["slotNumber"];
          Serial.print("✓ Valid voucher! Opening entrance gate for slot: ");
          Serial.println(slotNumber);
          
          // Track reserved slot for LED indicator
          reservedSlotNumber = slotNumber;
          ledActiveForReservedSlot = true;
          ledTurnedOnTime = millis();
          
          // Turn ON indicator LED
          digitalWrite(indicatorLedPin, HIGH);
          indicatorLedOn = true;
          logLedEvent("ON", slotNumber, "Voucher validated for slot");
          
          openGate();
          
          // Publish to MQTT
          if (mqttClient.connected()) {
            String topic = "parking/voucher/success";
            mqttClient.publish(topic.c_str(), code.c_str());
            Serial.print("✓ Published to ");
            Serial.println(topic);
          }
          
          blinkSuccess();
        } else {
          Serial.println("✗ Invalid voucher!");
          
          if (mqttClient.connected()) {
            String topic = "parking/voucher/error";
            mqttClient.publish(topic.c_str(), "invalid");
            Serial.print("✓ Published to ");
            Serial.println(topic);
          }
          
          blinkError();
        }
      }
    } else {
      Serial.println("✗ Voucher validation failed!");
      blinkError();
    }
  } else {
    Serial.print("✗ HTTP request failed: ");
    Serial.println(http.errorToString(httpCode));
    blinkError();
  }
  
  http.end();
}

// ==================== SENSOR MONITORING ====================

void checkAllSensors() {
  for (int i = 0; i < 4; i++) {
    checkSensor(i);
  }
}

void checkSensor(int index) {
  if (millis() - lastSensorCheck[index] < SENSOR_DEBOUNCE) {
    return;
  }
  
  bool currentState = !digitalRead(irSensorPins[index]);
  
  if (currentState != sensorStates[index]) {
    sensorStates[index] = currentState;
    lastSensorCheck[index] = millis();
    
    String status = currentState ? "occupied" : "available";
    Serial.print("Slot ");
    Serial.print(index + 1);
    Serial.print(" sensor: ");
    Serial.println(status);
    
    sendSensorUpdate(index + 1, status);
    
    // Check if this is the reserved slot and it's now occupied
    if (ledActiveForReservedSlot && (index + 1) == reservedSlotNumber && currentState) {
      Serial.print("✓ Vehicle arrived at reserved slot ");
      Serial.println(reservedSlotNumber);
      logLedEvent("OFF", reservedSlotNumber, "Vehicle detected at reserved slot");
      
      // Turn OFF indicator LED
      digitalWrite(indicatorLedPin, LOW);
      indicatorLedOn = false;
      ledActiveForReservedSlot = false;
      
      // Turn OFF buzzer if active
      if (buzzerActive) {
        digitalWrite(buzzerPin, LOW);
        buzzerActive = false;
        logBuzzerEvent("OFF", reservedSlotNumber, "Correct slot detected - buzzer stopped");
      }
      
      reservedSlotNumber = -1;
    }
    // Check if vehicle entered WRONG slot
    else if (ledActiveForReservedSlot && (index + 1) != reservedSlotNumber && currentState) {
      Serial.print("✗ Vehicle entered WRONG slot! Reserved: ");
      Serial.print(reservedSlotNumber);
      Serial.print(", Actual: ");
      Serial.println(index + 1);
      
      // Activate buzzer
      if (!buzzerActive) {
        digitalWrite(buzzerPin, HIGH);
        buzzerActive = true;
        buzzerActivationTime = millis();
        logBuzzerEvent("ON", index + 1, "Wrong slot detected - vehicle should go to slot " + String(reservedSlotNumber));
      }
    }
    // Check if vehicle LEFT wrong slot
    else if (ledActiveForReservedSlot && buzzerActive && (index + 1) != reservedSlotNumber && !currentState) {
      Serial.print("Vehicle left wrong slot ");
      Serial.println(index + 1);
      logBuzzerEvent("PAUSED", index + 1, "Vehicle left wrong slot - waiting for correct slot");
      // Buzzer remains ON but we log this event
    }
    
    // Publish to MQTT
    if (mqttClient.connected()) {
      String topic = "parking/slot/" + String(index + 1) + "/status";
      StaticJsonDocument<200> payload;
      payload["slotNumber"] = index + 1;
      payload["status"] = status;
      payload["deviceId"] = "esp32-main";
      char buffer[128];
      serializeJson(payload, buffer, sizeof(buffer));
      mqttClient.publish(topic.c_str(), buffer);
      Serial.print("✓ Published to ");
      Serial.println(topic);
      Serial.print("Payload: ");
      Serial.println(buffer);
    }
    
    if (!currentState && gateServoOpen) {
      Serial.print("Vehicle left slot ");
      Serial.print(index + 1);
      Serial.println(", closing gate...");
      closeGate();
    }
  }
}

void sendSensorUpdate(int slotNumber, String status) {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }
  
  HTTPClient http;
  String url = String(BACKEND_API_BASE) + "/iot/sensor-update";
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-token", DEVICE_TOKEN);
  
  StaticJsonDocument<200> doc;
  doc["deviceId"] = "esp32-main";
  doc["slotNumber"] = slotNumber;
  doc["sensorIndex"] = slotNumber - 1;
  doc["value"] = status;
  
  String payload;
  serializeJson(doc, payload);
  Serial.print("POST ");
  Serial.print(url);
  Serial.print(" payload: ");
  Serial.println(payload);
  
  int httpCode = http.POST(payload);
  
  if (httpCode > 0) {
    String response = http.getString();
    Serial.print("Sensor update sent: ");
    Serial.println(httpCode);
    Serial.print("Response body: ");
    Serial.println(response);
  } else {
    Serial.print("Sensor update failed: ");
    Serial.println(http.errorToString(httpCode));
  }
  
  http.end();
}

// ==================== SERVO CONTROL ====================

void openGate() {
  gateServo.write(SERVO_OPEN);
  gateServoOpen = true;
  gateServoOpenTime = millis();
  
  Serial.println("Entrance gate opened");
  
  sendServoCallback("open");
}

void closeGate() {
  gateServo.write(SERVO_CLOSED);
  gateServoOpen = false;
  
  Serial.println("Entrance gate closed");
  
  sendServoCallback("closed");
}

void handleAutoCloseGate() {
  if (gateServoOpen && millis() - gateServoOpenTime >= SERVO_AUTO_CLOSE_DELAY) {
    Serial.println("Auto-closing entrance gate (timer)");
    closeGate();
  }
}

void sendServoCallback(String state) {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }
  
  HTTPClient http;
  String url = String(BACKEND_API_BASE) + "/iot/servo-callback";
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-token", DEVICE_TOKEN);
  
  StaticJsonDocument<200> doc;
  doc["deviceId"] = "esp32-main";
  doc["servoState"] = state;
  
  String payload;
  serializeJson(doc, payload);
  Serial.print("POST ");
  Serial.print(url);
  Serial.print(" payload: ");
  Serial.println(payload);
  
  int httpCode = http.POST(payload);
  if (httpCode > 0) {
    Serial.print("Servo callback status: ");
    Serial.println(httpCode);
    Serial.print("Response body: ");
    Serial.println(http.getString());
  } else {
    Serial.print("Servo callback failed: ");
    Serial.println(http.errorToString(httpCode));
  }
  http.end();
  
  // Publish to MQTT
  if (mqttClient.connected()) {
    StaticJsonDocument<200> gatePayload;
    gatePayload["state"] = state;
    gatePayload["deviceId"] = "esp32-main";
    char buffer[128];
    serializeJson(gatePayload, buffer, sizeof(buffer));
    const char* topic = "parking/gate/state";
    mqttClient.publish(topic, buffer);
    Serial.print("✓ Published to ");
    Serial.println(topic);
    Serial.print("Payload: ");
    Serial.println(buffer);
  }
}

// ==================== UTILITY FUNCTIONS ====================

void logLedEvent(String state, int slotNumber, String reason) {
  // Log format: [HH:MM:SS] LED [ON/OFF] - Slot: X - Reason: ...
  unsigned long uptime = millis() / 1000;
  unsigned int hours = (uptime / 3600) % 24;
  unsigned int minutes = (uptime / 60) % 60;
  unsigned int seconds = uptime % 60;
  
  Serial.print("[");
  if (hours < 10) Serial.print("0");
  Serial.print(hours);
  Serial.print(":");
  if (minutes < 10) Serial.print("0");
  Serial.print(minutes);
  Serial.print(":");
  if (seconds < 10) Serial.print("0");
  Serial.print(seconds);
  Serial.print("] ");
  Serial.print("LED [");
  Serial.print(state);
  Serial.print("] - Slot: ");
  Serial.print(slotNumber);
  Serial.print(" - Reason: ");
  Serial.println(reason);
  
  // Optional: Send LED log to backend via MQTT
  if (mqttClient.connected()) {
    StaticJsonDocument<256> logPayload;
    logPayload["timestamp"] = uptime;
    logPayload["ledState"] = state;
    logPayload["slotNumber"] = slotNumber;
    logPayload["reason"] = reason;
    logPayload["deviceId"] = "esp32-main";
    
    char buffer[256];
    serializeJson(logPayload, buffer, sizeof(buffer));
    
    const char* topic = "parking/led/log";
    mqttClient.publish(topic, buffer);
  }
}

void logBuzzerEvent(String state, int slotNumber, String reason) {
  // Log format: [HH:MM:SS] BUZZER [ON/OFF/PAUSED] - Slot: X - Reason: ...
  unsigned long uptime = millis() / 1000;
  unsigned int hours = (uptime / 3600) % 24;
  unsigned int minutes = (uptime / 60) % 60;
  unsigned int seconds = uptime % 60;
  
  Serial.print("[");
  if (hours < 10) Serial.print("0");
  Serial.print(hours);
  Serial.print(":");
  if (minutes < 10) Serial.print("0");
  Serial.print(minutes);
  Serial.print(":");
  if (seconds < 10) Serial.print("0");
  Serial.print(seconds);
  Serial.print("] ");
  Serial.print("🔔 BUZZER [");
  Serial.print(state);
  Serial.print("] - Slot: ");
  Serial.print(slotNumber);
  Serial.print(" - Reason: ");
  Serial.println(reason);
  
  // Send buzzer log to backend via MQTT
  if (mqttClient.connected()) {
    StaticJsonDocument<256> logPayload;
    logPayload["timestamp"] = uptime;
    logPayload["buzzerState"] = state;
    logPayload["slotNumber"] = slotNumber;
    logPayload["reason"] = reason;
    logPayload["deviceId"] = "esp32-main";
    
    char buffer[256];
    serializeJson(logPayload, buffer, sizeof(buffer));
    
    const char* topic = "parking/buzzer/log";
    mqttClient.publish(topic, buffer);
  }
}

void blinkSuccess() {
  Serial.println("✓ Success!");
}

void blinkError() {
  Serial.println("✗ Error!");
}
