/*
 * Parqeer Smart IoT Parking System - ESP32 Main Program (UPDATED PINOUT)
 * 
 * Features:
 * - 4 IR Sensors for parking slot detection
 * - 4 Servo motors for gate/gate arm control
 * - 4x4 Keypad for voucher input
 * - WiFi connectivity to Backend API + Blynk Cloud
 * 
 * Hardware Pinout (Final - Safe for ESP32):
 * 
 * IR Sensors (Active LOW = Object detected)
 *   Slot 1 → GPIO 18
 *   Slot 2 → GPIO 19
 *   Slot 3 → GPIO 21
 *   Slot 4 → GPIO 22
 * 
 * Servo Motors (PWM supported pins)
 *   Gate/Slot 1 → GPIO 26
 *   Gate/Slot 2 → GPIO 27
 *   Gate/Slot 3 → GPIO 33
 *   Gate/Slot 4 → GPIO 32
 * 
 * Keypad 4x4 (Matrix)
 *   Rows → GPIO 32, 25, 4, 5
 *   Cols → GPIO 14, 27, 33, 26
 * 
 * Notes:
 * - All GND must be COMMON Ground
 * - Supply servo with external 5V if powerful servo is used
 * - Designed compatible with backend:
 *    validate voucher → /api/iot/validate
 *    update sensor   → /api/iot/sensor-update
 *    servo callback  → /api/iot/servo-callback
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <BlynkSimpleEsp32.h>
#include <ESP32Servo.h>
#include <Keypad.h>
#include <ArduinoJson.h>

// ==================== CONFIGURATION ====================

// WiFi Credentials
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// Backend API Configuration
#define BACKEND_URL "http://YOUR_BACKEND_IP:4000"
#define DEVICE_TOKEN "sample_device_token"

// Blynk Configuration
#define BLYNK_TEMPLATE_ID "YOUR_TEMPLATE_ID"
#define BLYNK_TEMPLATE_NAME "Parqeer Smart Parking"
#define BLYNK_AUTH_TOKEN "YOUR_BLYNK_AUTH_TOKEN"

// Virtual Pins
#define VPIN_AVAILABLE_COUNT V0
#define VPIN_SLOT_SUMMARY V1
#define VPIN_SERVO_COMMAND V2
#define VPIN_SENSOR_SLOT_1 V3
#define VPIN_SENSOR_SLOT_2 V4
#define VPIN_SENSOR_SLOT_3 V5
#define VPIN_SENSOR_SLOT_4 V6
#define VPIN_LAST_VOUCHER V7

// ==================== HARDWARE PINS ====================

// IR Sensor Pins (Active LOW - detects obstacle)
const int irSensorPins[4] = {18, 19, 21, 22};

// Servo Motor Pins
const int servoPins[4] = {26, 27, 33, 32};

// Servo Positions
const int SERVO_CLOSED = 0;
const int SERVO_OPEN = 90;

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

Servo servos[4];
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

// ==================== VARIABLES ====================

String voucherCode = "";
bool sensorStates[4] = {false, false, false, false}; // false = empty, true = occupied
unsigned long lastSensorCheck[4] = {0, 0, 0, 0};
unsigned long lastBlynkUpdate = 0;

const unsigned long SENSOR_DEBOUNCE = 2000; // 2 seconds debounce
const unsigned long BLYNK_UPDATE_INTERVAL = 5000; // Update Blynk every 5 seconds
const unsigned long SERVO_AUTO_CLOSE_DELAY = 5000; // Auto-close gate after 5 seconds
const int VOUCHER_LENGTH = 6;

bool servoOpenStates[4] = {false, false, false, false};
unsigned long servoOpenTime[4] = {0, 0, 0, 0};

// ==================== SETUP ====================

void setup() {
  Serial.begin(115200);
  Serial.println("\n=== Parqeer Smart Parking System ===");
  
  // Initialize IR Sensors
  for (int i = 0; i < 4; i++) {
    pinMode(irSensorPins[i], INPUT_PULLUP);
  }
  Serial.println("✓ IR Sensors initialized");
  
  // Initialize Servos
  for (int i = 0; i < 4; i++) {
    servos[i].attach(servoPins[i]);
    servos[i].write(SERVO_CLOSED);
  }
  Serial.println("✓ Servo motors initialized");
  
  // Connect to WiFi
  connectWiFi();
  
  // Initialize Blynk
  Blynk.config(BLYNK_AUTH_TOKEN);
  Blynk.connect();
  Serial.println("✓ Blynk connected");
  
  // Initial sensor readings
  checkAllSensors();
  
  Serial.println("=== System Ready ===\n");
}

// ==================== MAIN LOOP ====================

void loop() {
  Blynk.run();
  
  // Check keypad for voucher input
  handleKeypadInput();
  
  // Monitor all sensors
  checkAllSensors();
  
  // Auto-close servos if needed
  handleAutoCloseServos();
  
  // Periodic Blynk updates
  if (millis() - lastBlynkUpdate > BLYNK_UPDATE_INTERVAL) {
    updateBlynkStatus();
    lastBlynkUpdate = millis();
  }
  
  delay(50);
}

// ==================== WIFI CONNECTION ====================

void connectWiFi() {
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

// ==================== KEYPAD HANDLING ====================

void handleKeypadInput() {
  char key = keypad.getKey();
  
  if (key) {
    Serial.print("Key pressed: ");
    Serial.println(key);
    
    if (key == '#') {
      // Submit voucher
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
      // Clear voucher
      voucherCode = "";
      Serial.println("Voucher cleared");
    }
    else if (key >= '0' && key <= '9' || key >= 'A' && key <= 'D') {
      // Add to voucher code
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
  String url = String(BACKEND_URL) + "/api/iot/validate";
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-token", DEVICE_TOKEN);
  
  // Create JSON payload
  StaticJsonDocument<200> doc;
  doc["code"] = code;
  doc["deviceId"] = "esp32-main";
  
  String payload;
  serializeJson(doc, payload);
  
  Serial.println("Sending validation request...");
  int httpCode = http.POST(payload);
  
  if (httpCode > 0) {
    String response = http.getString();
    Serial.print("Response code: ");
    Serial.println(httpCode);
    Serial.print("Response: ");
    Serial.println(response);
    
    if (httpCode == 200) {
      // Parse response
      StaticJsonDocument<200> responseDoc;
      DeserializationError error = deserializeJson(responseDoc, response);
      
      if (!error) {
        bool valid = responseDoc["valid"];
        
        if (valid) {
          int slotNumber = responseDoc["slotNumber"];
          Serial.print("✓ Valid voucher! Opening gate for slot: ");
          Serial.println(slotNumber);
          
          // Open corresponding servo
          openServo(slotNumber - 1); // Convert to 0-indexed
          
          // Update Blynk
          Blynk.virtualWrite(VPIN_LAST_VOUCHER, code);
          
          blinkSuccess();
        } else {
          Serial.println("✗ Invalid voucher!");
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
  // Debounce check
  if (millis() - lastSensorCheck[index] < SENSOR_DEBOUNCE) {
    return;
  }
  
  // Read sensor (Active LOW - LOW means obstacle detected)
  bool currentState = !digitalRead(irSensorPins[index]); // Invert for logical state
  
  // Check if state changed
  if (currentState != sensorStates[index]) {
    sensorStates[index] = currentState;
    lastSensorCheck[index] = millis();
    
    String status = currentState ? "occupied" : "available";
    Serial.print("Slot ");
    Serial.print(index + 1);
    Serial.print(" sensor: ");
    Serial.println(status);
    
    // Send update to backend
    sendSensorUpdate(index + 1, status);
    
    // Update Blynk
    int vpinIndex = VPIN_SENSOR_SLOT_1 + index;
    Blynk.virtualWrite(vpinIndex, status);
    
    // Auto-close servo if vehicle left
    if (!currentState && servoOpenStates[index]) {
      Serial.print("Vehicle left slot ");
      Serial.print(index + 1);
      Serial.println(", closing gate...");
      closeServo(index);
    }
  }
}

void sendSensorUpdate(int slotNumber, String status) {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }
  
  HTTPClient http;
  String url = String(BACKEND_URL) + "/api/iot/sensor-update";
  
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
  
  int httpCode = http.POST(payload);
  
  if (httpCode > 0) {
    Serial.print("Sensor update sent: ");
    Serial.println(httpCode);
  } else {
    Serial.print("Sensor update failed: ");
    Serial.println(http.errorToString(httpCode));
  }
  
  http.end();
}

// ==================== SERVO CONTROL ====================

void openServo(int index) {
  if (index < 0 || index >= 4) return;
  
  servos[index].write(SERVO_OPEN);
  servoOpenStates[index] = true;
  servoOpenTime[index] = millis();
  
  Serial.print("Gate ");
  Serial.print(index + 1);
  Serial.println(" opened");
  
  // Send callback to backend
  sendServoCallback("open", index + 1);
}

void closeServo(int index) {
  if (index < 0 || index >= 4) return;
  
  servos[index].write(SERVO_CLOSED);
  servoOpenStates[index] = false;
  
  Serial.print("Gate ");
  Serial.print(index + 1);
  Serial.println(" closed");
  
  // Send callback to backend
  sendServoCallback("closed", index + 1);
}

void handleAutoCloseServos() {
  for (int i = 0; i < 4; i++) {
    if (servoOpenStates[i]) {
      // Check if sensor detects vehicle (occupied)
      if (sensorStates[i]) {
        // Vehicle entered, close gate after delay
        if (millis() - servoOpenTime[i] > SERVO_AUTO_CLOSE_DELAY) {
          Serial.print("Auto-closing gate ");
          Serial.print(i + 1);
          Serial.println(" (vehicle detected)");
          closeServo(i);
        }
      }
    }
  }
}

void sendServoCallback(String state, int slotNumber) {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }
  
  HTTPClient http;
  String url = String(BACKEND_URL) + "/api/iot/servo-callback";
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-token", DEVICE_TOKEN);
  
  StaticJsonDocument<200> doc;
  doc["deviceId"] = "esp32-main";
  doc["servoState"] = String(state) + ":" + String(slotNumber);
  
  String payload;
  serializeJson(doc, payload);
  
  http.POST(payload);
  http.end();
}

// ==================== BLYNK HANDLERS ====================

// Listen for servo commands from Blynk/Backend
BLYNK_WRITE(VPIN_SERVO_COMMAND) {
  String command = param.asString();
  Serial.print("Blynk command received: ");
  Serial.println(command);
  
  // Parse command format: "open:1" or "close:1"
  int colonIndex = command.indexOf(':');
  if (colonIndex > 0) {
    String action = command.substring(0, colonIndex);
    int slotNumber = command.substring(colonIndex + 1).toInt();
    
    if (slotNumber >= 1 && slotNumber <= 4) {
      if (action == "open") {
        openServo(slotNumber - 1);
      } else if (action == "close") {
        closeServo(slotNumber - 1);
      }
    }
  }
}

void updateBlynkStatus() {
  // Update sensor status to Blynk
  for (int i = 0; i < 4; i++) {
    String status = sensorStates[i] ? "occupied" : "available";
    Blynk.virtualWrite(VPIN_SENSOR_SLOT_1 + i, status);
  }
}

// ==================== UTILITY FUNCTIONS ====================

void blinkSuccess() {
  // Can be connected to LED indicator
  Serial.println("✓ Success!");
}

void blinkError() {
  // Can be connected to LED indicator
  Serial.println("✗ Error!");
}

// ==================== CONNECTION CHECK ====================

BLYNK_CONNECTED() {
  Serial.println("Blynk connected!");
  updateBlynkStatus();
}

BLYNK_DISCONNECTED() {
  Serial.println("Blynk disconnected!");
}
