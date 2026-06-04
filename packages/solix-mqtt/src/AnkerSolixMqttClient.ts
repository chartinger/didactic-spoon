import type { AnkerSolixClient } from "@lab759/solix-api";
import EventEmitter from 'node:events';
import type { DeviceStatus } from "../../solix-api/dist/index.cjs";

type Events = {
  deviceStatus: (status: DeviceStatus) => void;
 [key: string]: any; 
};

export class AnkerSolixMqttClient extends EventEmitter<Events> {
  constructor(private apiClient: AnkerSolixClient) {
    super();
  }

  public async connect(): Promise<void> {}

  public disconnect(): void {}
}