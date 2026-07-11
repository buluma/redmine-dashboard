declare module "web-push" {
  interface PushSubscription {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  }

  interface VapidDetails {
    subject: string;
    publicKey: string;
    privateKey: string;
  }

  interface WebPushOptions {
    TTL?: number;
    vapidDetails?: VapidDetails;
    proxy?: string;
  }

  const webPush: {
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
    sendNotification(subscription: PushSubscription, payload?: string, options?: WebPushOptions): Promise<void>;
    generateVAPIDKeys(): { publicKey: string; privateKey: string };
  };
  export default webPush;
}
