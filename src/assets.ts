import { AssetType, defineAssets } from '@iwsdk/core';

const publicAssetUrl = (path: string): string =>
  `${import.meta.env.BASE_URL}${path.replace(/^\/+/u, '')}`;

export default defineAssets({
  'apexpulse-hud': {
    name: 'ApexPulse Broadcast & AI Race Engineer HUD',
    type: AssetType.UIKitML,
    url: publicAssetUrl('ui/apexpulse-hud.uikitml'),
    priority: 'critical',
  },
});