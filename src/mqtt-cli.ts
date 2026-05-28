import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect } from "mqtt";
import { AnkerSolixClient } from "./client.js";

async function main(): Promise<void> {
  const email = process.env.ANKER_EMAIL;
  const password = process.env.ANKER_PASSWORD;
  const countryId = process.env.ANKER_COUNTRY_ID ?? "DE";

  if (!email || !password) {
    throw new Error("Set ANKER_EMAIL and ANKER_PASSWORD environment variables.");
  }

  const client = new AnkerSolixClient({ email, password, countryId });

  process.stderr.write("Fetching MQTT credentials…\n");
  const [mqttInfo, devices] = await Promise.all([
    client.getMqttInfo(),
    client.getSiteDevices(),
  ]);

  if (devices.length === 0) {
    throw new Error("No devices found for this account.");
  }

  // Write PEM files to a temp directory.
  const tmpDir = tmpdir();
  const caPath = join(tmpDir, "anker-ca.pem");
  const certPath = join(tmpDir, "anker-client.pem");
  const keyPath = join(tmpDir, "anker-client.key");
  writeFileSync(caPath, mqttInfo.caCert);
  writeFileSync(certPath, mqttInfo.clientCert);
  writeFileSync(keyPath, mqttInfo.clientKey);

  const cleanup = (): void => {
    for (const path of [caPath, certPath, keyPath]) {
      try { rmSync(path); } catch { /* ignore */ }
    }
  };

  const brokerUrl = `mqtts://${mqttInfo.brokerHost}:${mqttInfo.brokerPort}`;
  process.stderr.write(`Connecting to ${brokerUrl}…\n`);

  const options: Parameters<typeof connect>[1] = {
    ca: mqttInfo.caCert,
    cert: mqttInfo.clientCert,
    key: mqttInfo.clientKey,
    rejectUnauthorized: true,
    protocol: "mqtts",
  };
  if (mqttInfo.clientId) {
    options.clientId = mqttInfo.clientId;
  }

  const mqttClient = connect(brokerUrl, options);

  mqttClient.on("connect", () => {
    process.stderr.write("Connected.\n");

    for (const device of devices) {
      const productCode = device.productCode || "+";
      const topic = `dt/anker_power/${productCode}/${device.deviceSn}/`;
      mqttClient.subscribe(topic, (err) => {
        if (err) {
          process.stderr.write(`Subscribe error for ${topic}: ${String(err)}\n`);
        } else {
          process.stderr.write(`Subscribed to ${topic}\n`);
        }
      });
    }
  });

  mqttClient.on("message", (topic: string, payload: Buffer) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload.toString("utf8"));
    } catch {
      parsed = payload.toString("base64");
    }
    const line = JSON.stringify({ topic, payload: parsed });
    process.stdout.write(`${line}\n`);
  });

  mqttClient.on("error", (err: Error) => {
    process.stderr.write(`MQTT error: ${err.message}\n`);
  });

  mqttClient.on("close", () => {
    process.stderr.write("Connection closed.\n");
    cleanup();
  });

  const exit = (code: number): void => {
    mqttClient.end(true, () => {
      cleanup();
      process.exit(code);
    });
  };

  process.on("SIGINT", () => exit(0));
  process.on("SIGTERM", () => exit(0));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
