#include <WiFi.h>
#include <WebServer.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SH110X.h>
#include <ArduinoJson.h>
#include "ssid_and_pass.h"

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64

Adafruit_SH1106G display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire);

const char* ssid = WIFI_SSID;
const char* password = WIFI_PASSWORD;

WebServer server(80);

void setup() {
  Serial.begin(115200);

  if(!display.begin(0x3C, true)) {
    Serial.println(F("SH1106G allocation failed"));
    for(;;);
  }
  
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SH110X_WHITE);
  display.setCursor(0, 0);
  display.println("Connecting to WiFi...");
  display.display();

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  display.clearDisplay();
  display.setCursor(0, 0);
  display.println("Connected to WiFi!");
  display.println("IP address:");
  display.println(WiFi.localIP());
  display.display();
  
  Serial.println("");
  Serial.println("WiFi connected");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());
  
  server.on("/", HTTP_GET, []() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "text/plain", "ESP32 OLED Server Ready");
  });
  
  server.on("/ping", HTTP_GET, []() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "text/plain", "Pong");
  });
  
  server.on("/update", HTTP_POST, handleUpdate);
  server.on("/update", HTTP_OPTIONS, handleCORS);
  
  server.onNotFound([]() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(404, "text/plain", "Not found");
  });
  
  server.begin();
  Serial.println("HTTP server started");
}

void loop() {
  server.handleClient();
}

void handleCORS() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  server.send(204);
}

void handleUpdate() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  
  if (!server.hasArg("plain")) {
    server.send(400, "text/plain", "No data received");
    return;
  }
  
  String jsonData = server.arg("plain");
  
  DynamicJsonDocument doc(8192);
  DeserializationError error = deserializeJson(doc, jsonData);
  
  if (error) {
    server.send(400, "text/plain", "Invalid JSON");
    return;
  }
  
  display.clearDisplay();
  
  if (doc.containsKey("pixels")) {
    JsonArray pixels = doc["pixels"];
    for (JsonVariant pixel : pixels) {
      int index = pixel.as<int>();
      if (index >= 0 && index < SCREEN_WIDTH * SCREEN_HEIGHT) {
        int x = index % SCREEN_WIDTH;
        int y = index / SCREEN_WIDTH;
        display.drawPixel(x, y, SH110X_WHITE);
      }
    }
  } 
  else if (doc.containsKey("data")) {
    JsonArray rleData = doc["data"];
    int pixelIndex = 0;
    
    for (JsonVariant item : rleData) {
      bool value = item["value"].as<bool>();
      int count = item["count"].as<int>();
      
      for (int i = 0; i < count && pixelIndex < SCREEN_WIDTH * SCREEN_HEIGHT; i++, pixelIndex++) {
        if (value) {
          int x = pixelIndex % SCREEN_WIDTH;
          int y = pixelIndex / SCREEN_WIDTH;
          display.drawPixel(x, y, SH110X_WHITE);
        }
      }
    }
  }
  
  display.display();
  
  server.send(200, "text/plain", "Display updated");
}