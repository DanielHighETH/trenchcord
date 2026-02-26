import type { GatewayManager } from '../discord/gatewayManager.js';

let gateway: GatewayManager | null = null;

export function getGateway(): GatewayManager | null {
  return gateway;
}

export function setGateway(gw: GatewayManager | null): void {
  gateway = gw;
}
