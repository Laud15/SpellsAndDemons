import {onCall, HttpsError} from "firebase-functions/v2/https";
import {sendPushToUser} from "../notifications/sendPushNotifications";

export const sendFriendRequestNotification = onCall(
  {
    region: "europe-west1",
    secrets: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "BACKEND_EMAIL"],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Not authenticated");

    console.log("data ricevuta:", JSON.stringify(request.data));

    const {toUid, fromUsername} = request.data;
    if (!toUid || !fromUsername) {
      console.log("toUid:", toUid, "fromUsername:", fromUsername);
      throw new HttpsError("invalid-argument", "missing data");
    }

    await sendPushToUser(
      toUid,
      "Friend Request",
      `${fromUsername} has sent you a friend request`,
      "/home",
    );

    return {success: true};
  }
);
