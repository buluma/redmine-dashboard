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

  function setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  function sendNotification(subscription: PushSubscription, payload?: string, options?: WebPushOptions): Promise<void>;
  function generateVAPIDKeys(): { publicKey: string; privateKey: string };

  export default {
    setVapidDetails,
    sendNotification,
    generateVAPIDKeys,
  };
}
