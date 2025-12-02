/*
 * Parqeer Smart IoT Parking System - ESP32 Main Program (MQTT HiveMQ Version)
 * 
 * Features:
 * - 4 IR Sensors for parking slot detection (4 slots)
 * - 1 Servo motor for entrance gate control
 * - 4x4 Keypad for voucher input
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
 * Keypad 4x4 (Matrix)
 *   Rows → GPIO 32, 25, 4, 5
 *   Cols → GPIO 14, 27, 33, 26
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

// ==================== CONFIGURATION ====================

// WiFi Credentials
#define WIFI_SSID "Wokwi-GUEST"
#define WIFI_PASSWORD ""

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
const int gateServoPin = 26;

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
byte colPins[COLS] = {14, 27, 33, 26};

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

// ==================== SETUP ====================

void setup() {
  Serial.begin(115200);
  Serial.println("\n=== Parqeer Smart Parking System (MQTT) ===");
  
  // Initialize IR Sensors
  for (int i = 0; i < 4; i++) {
    pinMode(irSensorPins[i], INPUT_PULLUP);
  }
  Serial.println("✓ IR Sensors initialized");
  
  // Initialize Gate Servo
  gateServo.attach(gateServoPin);
  gateServo.write(SERVO_CLOSED);
  Serial.println("✓ Gate servo initialized");
  
  // Connect to WiFi
  connectWiFi();
  
  // Setup MQTT
  wifiClient.setInsecure();
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  
  // Initial sensor readings
  checkAllSensors();
  
  Serial.println("=== System Ready ===\n");
}

// ==================== MAIN LOOP ====================

void loop() {
  // Handle WiFi reconnection
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }
  
  // Handle MQTT connection and messages
  if (!mqttClient.connected()) {
    if (millis() - lastMqttReconnect > MQTT_RECONNECT_INTERVAL) {
      reconnectMQTT();
      lastMqttReconnect = millis();
    }
  } else {
    mqttClient.loop();
  }
  
  // Check keypad for voucher input
  handleKeypadInput();
  
  // Monitor all sensors
  checkAllSensors();
  
  // Auto-close gate if needed
  handleAutoCloseGate();
  
  delay(50);
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
    Serial.println("✓ Subscribed to: parking/gate/open");
    Serial.println("✓ Subscribed to: parking/gate/close");
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
  if (gateServoOpen) {
    // Auto-close gate after delay if any vehicle is still detected in any slot
    bool vehicleDetected = false;
    for (int i = 0; i < 4; i++) {
      if (sensorStates[i]) {
        vehicleDetected = true;
        break;
      }
    }
    
    if (vehicleDetected) {
      if (millis() - gateServoOpenTime > SERVO_AUTO_CLOSE_DELAY) {
        Serial.println("Auto-closing entrance gate (vehicle detected)");
        closeGate();
      }
    }
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

void blinkSuccess() {
  Serial.println("✓ Success!");
}

void blinkError() {
  Serial.println("✗ Error!");
}