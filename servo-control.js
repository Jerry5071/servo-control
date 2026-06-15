(function (exports) {
    'use strict';

    /**
     * Parse the device ID from URL search parameters.
     * Falls back to 'servo_demo' when no `id` param is present.
     */
    function getDeviceId(searchParams) {
        return searchParams.get('id') || 'servo_demo';
    }

    /**
     * Build the MQTT topic string for a given device ID.
     */
    function buildMqttTopic(deviceId) {
        return 'smartservo/' + deviceId + '/control';
    }

    /**
     * Generate a unique MQTT client ID to avoid connection collisions.
     */
    function generateClientId(deviceId) {
        return 'web_' + deviceId + '_' + Date.now() + '_' + Math.random().toString(16).substr(2, 8);
    }

    /**
     * Connect to the MQTT broker and wire up event handlers.
     *
     * @param {object}   mqtt          - The mqtt library (e.g. window.mqtt or require('mqtt'))
     * @param {string}   mqttUrl       - WebSocket URL of the broker
     * @param {string}   clientId      - Unique client identifier
     * @param {object}   callbacks     - { onConnect, onError, onOffline, onReconnect }
     * @returns {object} The mqttClient instance
     */
    function connectMQTT(mqtt, mqttUrl, clientId, callbacks) {
        var client = mqtt.connect(mqttUrl, {
            clientId: clientId,
            clean: true,
            connectTimeout: 4000,
            reconnectPeriod: 1000,
        });

        if (callbacks.onConnect) {
            client.on('connect', callbacks.onConnect);
        }
        if (callbacks.onError) {
            client.on('error', callbacks.onError);
        }
        if (callbacks.onOffline) {
            client.on('offline', callbacks.onOffline);
        }
        if (callbacks.onReconnect) {
            client.on('reconnect', callbacks.onReconnect);
        }

        return client;
    }

    /**
     * Publish an angle value to the given topic.
     *
     * @param {object}   client  - A connected MQTT client
     * @param {string}   topic   - The MQTT topic to publish on
     * @param {number}   angle   - The angle value (-90 to 90)
     * @param {function} [onError] - Optional error callback
     * @returns {boolean} true if publish was attempted, false if client not connected
     */
    function publishAngle(client, topic, angle, onError) {
        if (client && client.connected) {
            client.publish(topic, String(angle), { qos: 0 }, function (err) {
                if (err && onError) {
                    onError(err);
                }
            });
            return true;
        }
        return false;
    }

    /**
     * Clamp an angle value to the valid servo range [-90, 90].
     */
    function clampAngle(angle) {
        return Math.max(-90, Math.min(90, angle));
    }

    /**
     * Update the UI elements to reflect a new angle.
     *
     * @param {HTMLElement} display - The angle display element
     * @param {HTMLInputElement} slider - The range slider element
     * @param {number} angle - The angle to show
     */
    function updateAngleUI(display, slider, angle) {
        var clamped = clampAngle(angle);
        display.textContent = clamped + '°';
        slider.value = clamped;
    }

    /**
     * Update the connection status badge.
     *
     * @param {HTMLElement} badge     - The status badge element
     * @param {string}      status   - One of 'connected', 'disconnected', 'connecting', 'error', 'reconnecting'
     */
    function updateStatusBadge(badge, status) {
        var map = {
            connected:    { text: 'Connected',        className: 'status-badge connected' },
            disconnected: { text: 'Disconnected',     className: 'status-badge disconnected' },
            connecting:   { text: 'Connecting...',    className: 'status-badge connecting' },
            error:        { text: 'Connection Error', className: 'status-badge disconnected' },
            reconnecting: { text: 'Reconnecting...', className: 'status-badge connecting' },
        };
        var info = map[status];
        if (info) {
            badge.textContent = info.text;
            badge.className = info.className;
        }
    }

    /**
     * Enable or disable all control buttons and the slider.
     *
     * @param {NodeList|Array} buttons - The preset buttons
     * @param {HTMLInputElement} slider - The range slider
     * @param {boolean} enabled - Whether to enable controls
     */
    function setControlsEnabled(buttons, slider, enabled) {
        slider.disabled = !enabled;
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].disabled = !enabled;
        }
    }

    // Export for testing (CommonJS) or attach to window
    exports.getDeviceId = getDeviceId;
    exports.buildMqttTopic = buildMqttTopic;
    exports.generateClientId = generateClientId;
    exports.connectMQTT = connectMQTT;
    exports.publishAngle = publishAngle;
    exports.clampAngle = clampAngle;
    exports.updateAngleUI = updateAngleUI;
    exports.updateStatusBadge = updateStatusBadge;
    exports.setControlsEnabled = setControlsEnabled;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.ServoControl = {}));
