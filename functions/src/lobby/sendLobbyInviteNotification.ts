import {onCall, HttpsError} from "firebase-functions/v2/https";
import {sendPushToUser} from "../notifications/sendPushNotifications";
import {getFirestore, FieldValue} from "firebase-admin/firestore";

export const sendLobbyInviteNotification = onCall(
  {
    region: "europe-west1",
    secrets: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "BACKEND_EMAIL"],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Not authenticated");
    }

    const {toUid, fromUsername, lobbyId} = request.data;
    if (!toUid || !fromUsername || !lobbyId) {
      throw new HttpsError("invalid-argument", "Missing data");
    }

    const db = getFirestore();
    await db.collection("lobbies").doc(lobbyId).update({
      invitedIds: FieldValue.arrayUnion(toUid),
    });

    await sendPushToUser(
      toUid,
      "Lobby invite",
      `${fromUsername} invited you to a game`,
      `/lobby/${lobbyId}`
    );

    return {success: true};
  }
);
