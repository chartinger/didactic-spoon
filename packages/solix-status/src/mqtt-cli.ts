import { AnkerSolixClient, type AnkerClientOptions, type DeviceStatus } from '@lab759/solix-api';
import { AnkerSolixMqttClient } from '@lab759/solix-mqtt';
import 'dotenv/config';
import { loadAuthInfo, saveAuthTokensToCache } from './auth.js';

function parseArgs(): {
  raw: boolean;
  trigger: boolean;
  statusRequest: boolean;
  triggerTimeout: number;
  triggerSn: string | undefined;
} {
  const args = process.argv.slice(2);
  let triggerTimeout = 300;
  let triggerSn: string | undefined;
  const raw = args.includes('--raw');
  const trigger = args.includes('--trigger');
  const statusRequest = args.includes('--status-request');
  const timeoutIdx = args.indexOf('--trigger-timeout');
  if (timeoutIdx !== -1 && timeoutIdx + 1 < args.length) {
    triggerTimeout = Number(args[timeoutIdx + 1]);
  }
  const snIdx = args.indexOf('--device-sn');
  if (snIdx !== -1 && snIdx + 1 < args.length) {
    triggerSn = args[snIdx + 1];
  }
  return { raw, trigger, statusRequest, triggerTimeout, triggerSn };
}

async function main(): Promise<void> {
  const { raw, trigger, statusRequest, triggerTimeout, triggerSn } = parseArgs();

  const apiClientOptions: AnkerClientOptions = {
    ...loadAuthInfo(),
    onAuthTokens: (tokens) => saveAuthTokensToCache(tokens),
  };

  const client = new AnkerSolixClient(apiClientOptions);
  const mqttClient = new AnkerSolixMqttClient(client, { raw });

  mqttClient.on('message', (data) => {
    const timestamp = new Date().toISOString();
    process.stdout.write(`[${timestamp}] ${data.topic}:\n`);
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);

    if (data.pn === 'A17C5' && data.msgType === '0408') {
      const deviceStatus: DeviceStatus = {
        siteId: '?',
        deviceSn: data.sn,
        batteryPercent: Number(data.decoded?.battery_soc),
        panelInputWatts: Number(data.decoded?.photovoltaic_power),
        pvInput1Watts: Number(data.decoded?.pv_input_1_power),
        pvInput2Watts: Number(data.decoded?.pv_input_2_power),
        pvInput3Watts: Number(data.decoded?.pv_input_3_power),
        pvInput4Watts: Number(data.decoded?.pv_input_4_power),
        outputWatts: Number(data.decoded?.charged_energy), // Needs verification
      };
      console.dir(deviceStatus, { depth: null });
    }
  });

  mqttClient.on('raw', (data) => {
    const timestamp = new Date().toISOString();
    process.stdout.write(`[${timestamp}] ${data.topic} (raw):\n`);
    process.stdout.write(`${data.payload}\n`);
  });

  await mqttClient.connect();

  // Publish commands after a short delay so subscriptions are registered.
  if (trigger) {
    setTimeout(() => {
      process.stderr.write(`Publishing realtime trigger (timeout=${triggerTimeout}s)…\n`);
      mqttClient.publishRealtimeTrigger(triggerTimeout, triggerSn);
    }, 1_000);
  }

  if (statusRequest) {
    setTimeout(() => {
      process.stderr.write('Publishing status request…\n');
      mqttClient.publishStatusRequest(triggerSn);
    }, 1_000);
  }

  const exit = (code: number): void => {
    mqttClient.disconnect();
    process.exit(code);
  };

  process.on('SIGINT', () => exit(0));
  process.on('SIGTERM', () => exit(0));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
