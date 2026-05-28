import {setGlobalOptions} from "firebase-functions";
import {initializeApp} from "firebase-admin/app";

initializeApp();
setGlobalOptions({maxInstances: 5});

export {acceptFriendRequest} from "./social/acceptFriendRequest";
// eslint-disable-next-line max-len
export {sendFriendRequestNotification} from "./social/sendFriendRequestNotification";

export {sendLobbyInviteNotification} from "./lobby/sendLobbyInviteNotification";
