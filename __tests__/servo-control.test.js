/**
 * @jest-environment jsdom
 */

const SC = require('../servo-control');

// ---------------------------------------------------------------------------
// getDeviceId
// ---------------------------------------------------------------------------
describe('getDeviceId', () => {
    it('returns the id param when present', () => {
        const params = new URLSearchParams('?id=my_servo');
        expect(SC.getDeviceId(params)).toBe('my_servo');
    });

    it('falls back to servo_demo when id is absent', () => {
        const params = new URLSearchParams('');
        expect(SC.getDeviceId(params)).toBe('servo_demo');
    });

    it('falls back to servo_demo when id is empty string', () => {
        const params = new URLSearchParams('?id=');
        expect(SC.getDeviceId(params)).toBe('servo_demo');
    });

    it('uses the first id value when multiple are provided', () => {
        const params = new URLSearchParams('?id=first&id=second');
        expect(SC.getDeviceId(params)).toBe('first');
    });
});

// ---------------------------------------------------------------------------
// buildMqttTopic
// ---------------------------------------------------------------------------
describe('buildMqttTopic', () => {
    it('builds the correct topic for a device id', () => {
        expect(SC.buildMqttTopic('abc123')).toBe('smartservo/abc123/control');
    });

    it('builds topic for the default device id', () => {
        expect(SC.buildMqttTopic('servo_demo')).toBe('smartservo/servo_demo/control');
    });

    it('handles device ids with special characters', () => {
        expect(SC.buildMqttTopic('dev-01_v2')).toBe('smartservo/dev-01_v2/control');
    });
});

// ---------------------------------------------------------------------------
// generateClientId
// ---------------------------------------------------------------------------
describe('generateClientId', () => {
    it('starts with web_ prefix followed by device id', () => {
        const id = SC.generateClientId('mydev');
        expect(id).toMatch(/^web_mydev_/);
    });

    it('contains a timestamp segment', () => {
        const before = Date.now();
        const id = SC.generateClientId('d');
        const after = Date.now();
        // Extract the timestamp part (third segment)
        const parts = id.split('_');
        const ts = parseInt(parts[2], 10);
        expect(ts).toBeGreaterThanOrEqual(before);
        expect(ts).toBeLessThanOrEqual(after);
    });

    it('generates unique ids on successive calls', () => {
        const a = SC.generateClientId('d');
        const b = SC.generateClientId('d');
        expect(a).not.toBe(b);
    });
});

// ---------------------------------------------------------------------------
// clampAngle
// ---------------------------------------------------------------------------
describe('clampAngle', () => {
    it('returns the angle when within range', () => {
        expect(SC.clampAngle(0)).toBe(0);
        expect(SC.clampAngle(45)).toBe(45);
        expect(SC.clampAngle(-45)).toBe(-45);
    });

    it('clamps to 90 when above max', () => {
        expect(SC.clampAngle(100)).toBe(90);
        expect(SC.clampAngle(999)).toBe(90);
    });

    it('clamps to -90 when below min', () => {
        expect(SC.clampAngle(-100)).toBe(-90);
        expect(SC.clampAngle(-999)).toBe(-90);
    });

    it('returns exact boundary values', () => {
        expect(SC.clampAngle(90)).toBe(90);
        expect(SC.clampAngle(-90)).toBe(-90);
    });
});

// ---------------------------------------------------------------------------
// connectMQTT
// ---------------------------------------------------------------------------
describe('connectMQTT', () => {
    function createMockMqtt() {
        const handlers = {};
        const client = {
            on: jest.fn((event, cb) => { handlers[event] = cb; }),
            connected: false,
            publish: jest.fn(),
        };
        return {
            connect: jest.fn(() => client),
            client,
            handlers,
        };
    }

    it('calls mqtt.connect with the correct url and options', () => {
        const mockMqtt = createMockMqtt();
        SC.connectMQTT(mockMqtt, 'ws://broker:9001', 'client_1', {});
        expect(mockMqtt.connect).toHaveBeenCalledWith('ws://broker:9001', {
            clientId: 'client_1',
            clean: true,
            connectTimeout: 4000,
            reconnectPeriod: 1000,
        });
    });

    it('registers all four event callbacks', () => {
        const mockMqtt = createMockMqtt();
        const cbs = {
            onConnect: jest.fn(),
            onError: jest.fn(),
            onOffline: jest.fn(),
            onReconnect: jest.fn(),
        };
        SC.connectMQTT(mockMqtt, 'ws://b:1', 'c', cbs);
        expect(mockMqtt.client.on).toHaveBeenCalledWith('connect', cbs.onConnect);
        expect(mockMqtt.client.on).toHaveBeenCalledWith('error', cbs.onError);
        expect(mockMqtt.client.on).toHaveBeenCalledWith('offline', cbs.onOffline);
        expect(mockMqtt.client.on).toHaveBeenCalledWith('reconnect', cbs.onReconnect);
    });

    it('skips registering missing callbacks', () => {
        const mockMqtt = createMockMqtt();
        SC.connectMQTT(mockMqtt, 'ws://b:1', 'c', { onConnect: jest.fn() });
        // Only 'connect' should be registered
        const registeredEvents = mockMqtt.client.on.mock.calls.map(c => c[0]);
        expect(registeredEvents).toEqual(['connect']);
    });

    it('returns the mqtt client', () => {
        const mockMqtt = createMockMqtt();
        const result = SC.connectMQTT(mockMqtt, 'ws://b:1', 'c', {});
        expect(result).toBe(mockMqtt.client);
    });
});

// ---------------------------------------------------------------------------
// publishAngle
// ---------------------------------------------------------------------------
describe('publishAngle', () => {
    it('publishes the angle as a string with qos 0 when connected', () => {
        const client = { connected: true, publish: jest.fn() };
        const result = SC.publishAngle(client, 'topic/test', 45);
        expect(result).toBe(true);
        expect(client.publish).toHaveBeenCalledWith(
            'topic/test',
            '45',
            { qos: 0 },
            expect.any(Function)
        );
    });

    it('returns false when client is not connected', () => {
        const client = { connected: false, publish: jest.fn() };
        const result = SC.publishAngle(client, 'topic/test', 45);
        expect(result).toBe(false);
        expect(client.publish).not.toHaveBeenCalled();
    });

    it('returns false when client is null', () => {
        expect(SC.publishAngle(null, 'topic/test', 45)).toBe(false);
    });

    it('returns false when client is undefined', () => {
        expect(SC.publishAngle(undefined, 'topic/test', 45)).toBe(false);
    });

    it('calls onError callback when publish fails', () => {
        const publishErr = new Error('publish failed');
        const client = {
            connected: true,
            publish: jest.fn((topic, msg, opts, cb) => cb(publishErr)),
        };
        const onError = jest.fn();
        SC.publishAngle(client, 'topic', 10, onError);
        expect(onError).toHaveBeenCalledWith(publishErr);
    });

    it('does not throw when publish succeeds and no onError provided', () => {
        const client = {
            connected: true,
            publish: jest.fn((topic, msg, opts, cb) => cb(null)),
        };
        expect(() => SC.publishAngle(client, 'topic', 10)).not.toThrow();
    });

    it('publishes negative angles correctly', () => {
        const client = { connected: true, publish: jest.fn() };
        SC.publishAngle(client, 't', -90);
        expect(client.publish).toHaveBeenCalledWith('t', '-90', { qos: 0 }, expect.any(Function));
    });

    it('publishes zero correctly', () => {
        const client = { connected: true, publish: jest.fn() };
        SC.publishAngle(client, 't', 0);
        expect(client.publish).toHaveBeenCalledWith('t', '0', { qos: 0 }, expect.any(Function));
    });
});

// ---------------------------------------------------------------------------
// updateAngleUI
// ---------------------------------------------------------------------------
describe('updateAngleUI', () => {
    let display, slider;

    beforeEach(() => {
        display = document.createElement('div');
        slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '-90';
        slider.max = '90';
    });

    it('updates display text and slider value', () => {
        SC.updateAngleUI(display, slider, 45);
        expect(display.textContent).toBe('45°');
        expect(slider.value).toBe('45');
    });

    it('clamps values above 90', () => {
        SC.updateAngleUI(display, slider, 120);
        expect(display.textContent).toBe('90°');
        expect(slider.value).toBe('90');
    });

    it('clamps values below -90', () => {
        SC.updateAngleUI(display, slider, -120);
        expect(display.textContent).toBe('-90°');
        expect(slider.value).toBe('-90');
    });

    it('handles zero', () => {
        SC.updateAngleUI(display, slider, 0);
        expect(display.textContent).toBe('0°');
        expect(slider.value).toBe('0');
    });
});

// ---------------------------------------------------------------------------
// updateStatusBadge
// ---------------------------------------------------------------------------
describe('updateStatusBadge', () => {
    let badge;

    beforeEach(() => {
        badge = document.createElement('div');
    });

    it.each([
        ['connected',    'Connected',        'status-badge connected'],
        ['disconnected', 'Disconnected',     'status-badge disconnected'],
        ['connecting',   'Connecting...',    'status-badge connecting'],
        ['error',        'Connection Error', 'status-badge disconnected'],
        ['reconnecting', 'Reconnecting...', 'status-badge connecting'],
    ])('sets correct text and class for status "%s"', (status, expectedText, expectedClass) => {
        SC.updateStatusBadge(badge, status);
        expect(badge.textContent).toBe(expectedText);
        expect(badge.className).toBe(expectedClass);
    });

    it('does nothing for an unknown status', () => {
        badge.textContent = 'Original';
        badge.className = 'original-class';
        SC.updateStatusBadge(badge, 'unknown_status');
        expect(badge.textContent).toBe('Original');
        expect(badge.className).toBe('original-class');
    });
});

// ---------------------------------------------------------------------------
// setControlsEnabled
// ---------------------------------------------------------------------------
describe('setControlsEnabled', () => {
    let slider, buttons;

    beforeEach(() => {
        slider = document.createElement('input');
        slider.type = 'range';
        buttons = [
            document.createElement('button'),
            document.createElement('button'),
            document.createElement('button'),
        ];
        // Start all disabled
        slider.disabled = true;
        buttons.forEach(b => { b.disabled = true; });
    });

    it('enables all controls when enabled=true', () => {
        SC.setControlsEnabled(buttons, slider, true);
        expect(slider.disabled).toBe(false);
        buttons.forEach(b => expect(b.disabled).toBe(false));
    });

    it('disables all controls when enabled=false', () => {
        // First enable them
        SC.setControlsEnabled(buttons, slider, true);
        // Then disable
        SC.setControlsEnabled(buttons, slider, false);
        expect(slider.disabled).toBe(true);
        buttons.forEach(b => expect(b.disabled).toBe(true));
    });

    it('handles empty button list', () => {
        expect(() => SC.setControlsEnabled([], slider, true)).not.toThrow();
        expect(slider.disabled).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Integration-style: full flow
// ---------------------------------------------------------------------------
describe('integration: device setup and publish flow', () => {
    it('parses device id, builds topic, and publishes', () => {
        const params = new URLSearchParams('?id=test_device');
        const deviceId = SC.getDeviceId(params);
        const topic = SC.buildMqttTopic(deviceId);

        expect(deviceId).toBe('test_device');
        expect(topic).toBe('smartservo/test_device/control');

        const client = { connected: true, publish: jest.fn() };
        const result = SC.publishAngle(client, topic, 30);
        expect(result).toBe(true);
        expect(client.publish).toHaveBeenCalledWith(
            'smartservo/test_device/control',
            '30',
            { qos: 0 },
            expect.any(Function)
        );
    });

    it('connect → enable controls → publish → disconnect → disable controls', () => {
        const badge = document.createElement('div');
        const slider = document.createElement('input');
        slider.type = 'range';
        const buttons = [document.createElement('button')];

        // Initially disconnected
        SC.updateStatusBadge(badge, 'connecting');
        SC.setControlsEnabled(buttons, slider, false);
        expect(badge.textContent).toBe('Connecting...');
        expect(slider.disabled).toBe(true);

        // On connect
        SC.updateStatusBadge(badge, 'connected');
        SC.setControlsEnabled(buttons, slider, true);
        expect(badge.textContent).toBe('Connected');
        expect(slider.disabled).toBe(false);

        // Publish
        const client = { connected: true, publish: jest.fn() };
        SC.publishAngle(client, 'smartservo/dev/control', 60);
        expect(client.publish).toHaveBeenCalled();

        // On disconnect
        SC.updateStatusBadge(badge, 'disconnected');
        SC.setControlsEnabled(buttons, slider, false);
        expect(badge.textContent).toBe('Disconnected');
        expect(slider.disabled).toBe(true);
    });
});
