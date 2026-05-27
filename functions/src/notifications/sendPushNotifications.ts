import * as webpush from "web-push";
import {getFirestore} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";

const vapidPublicKey = defineSecret("VAPID_PUBLIC_KEY");
const vapidPrivateKey = defineSecret("VAPID_PRIVATE_KEY");
const backendEmail = defineSecret("BACKEND_EMAIL");

const db = getFirestore();

// eslint-disable-next-line require-jsdoc
export async function sendPushToUser(
  uid: string,
  title: string,
  body: string,
  // eslint-disable-next-line @typescript-eslint/no-inferrable-types
  url: string = "/"
): Promise<void> {
  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists) return;

  const subscription = userSnap.data()?.pushSubscription;
  if (!subscription) return;

  webpush.setVapidDetails(
    `mailto:${backendEmail.value()}`,
    vapidPublicKey.value(),
    vapidPrivateKey.value()
  );

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({title, body, url})
    );
  } catch (error: any) {
    if (error.statusCode === 410) {
      await db.collection("users").doc(uid).update({
        pushSubscription: null,
      });
    }
  }
}
