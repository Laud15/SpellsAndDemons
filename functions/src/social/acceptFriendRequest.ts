import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, FieldValue} from "firebase-admin/firestore";

const db = getFirestore();

/**
 * WORKFLOW: Accept Friend Request (Client-Server Interface)
 * * 1. CLIENT INITIATION (SvelteKit):
 * The user clicks Accept in the UI, triggering `acceptFriendRequest(request)`.
 * httpsCallable(functions, 'acceptFriendRequest') establishes a secure bridge.
 * The client sends the payload `{ requestId: request.id }`.
 * FireBase SDK automatically attaches the current user's Auth JWT token.
 * 2. SERVER RECEPTION & AUTHENTICATION (Cloud Function):
 * The function triggers via `onCall` in the 'europe-west1' region.
 * It decodes the JWT token to extract the caller's UID (request.auth?.uid)
 * It extracts the `requestId` from `request.data`.
 * 3. SECURITY & VALIDATION CHECKS (Backend Rules):
 * Verifies the caller is authenticated.
 * Fetch the friend request document
 * from Firestore using Admin SDK bypas client rules
 * Verifies that the caller's UID matches the `toUid` (receiver)
 * of the request to prevent malicious
 * users from accepting requests sent to others.
 * Ensures the request status is still "pending".
 * 4. ATOMIC DATABASE UPDATE (Firestore Write Batch):
 * If all checks pass, an atomic `db.batch()` is initialized ("all-or-nothing").
 * Op 1: Updates the friend request status to "accepted".
 * Op 2: Dynamically appends the sender's UID to the receiver's friends array
 * Op3: Dynamically appends the receiver's UID to the sender's friends array
 * `batch.commit()` executes all three writes simultaneously on the server.
 * 5. RESPONSE & UI SYNC:
 * The function returns `{ success: true }` back to SvelteKit.
 * Since the client app listens to user profile changes (via onSnapshot/Stores)
 * the UI automatically and instantly updates to reflect the new friendship
 */


export const acceptFriendRequest = onCall(
  {region: "europe-west1"},
  async (request) => {
    // extract who called acceptFriendRequest from the token
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Non autenticato");

    // take the argument (the id of the request)
    const {requestId} = request.data;
    if (!requestId) {
      throw new HttpsError("invalid-argument", "requestId missing");
    }

    const requestRef = db.collection("friendRequests").doc(requestId);
    const requestSnap = await requestRef.get();

    if (!requestSnap.exists) {
      throw new HttpsError("not-found", "Request not find");
    }

    const friendRequest = requestSnap.data();
    if (!friendRequest) {
      throw new HttpsError("not-found", "Data not found");
    }

    // check if who is calling is the receiver
    if (friendRequest.toUid !== uid) {
      throw new HttpsError("permission-denied", "You are not the receiver");
    }

    if (friendRequest.status !== "pending") {
      throw new HttpsError("failed-precondition", "Request is no more pending");
    }

    const batch = db.batch();

    /* NOTE ON FieldValue.arrayUnion
      FieldValue.arrayUnion is special function given by firestore's SDK
      is used for interact with array type field without move them from cloud
      arrayUnion guarantees that every element in the array is unique
      is an atomic operation, no race condition!
      is good for performance economy
    */

    // update request status
    batch.update(requestRef, {status: "accepted"});

    // add the sender to the receiver's friend list
    batch.update(db.collection("users").doc(uid), {
      friends: FieldValue.arrayUnion(friendRequest.fromUid),
    });

    // add the receiver to the sender's friend list
    batch.update(db.collection("users").doc(friendRequest.fromUid), {
      friends: FieldValue.arrayUnion(uid),
    });

    await batch.commit();
    return {success: true};
  });
