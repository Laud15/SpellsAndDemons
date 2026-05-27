import { doc, updateDoc } from 'firebase/firestore';
import { db } from './clientSDK';
import { PUBLIC_VAPID_KEY } from '$env/static/public';
import { push } from 'firebase/database';


//convert the vapid key from base 64 to Uint8Array (required by push API)
// This conversion is mandatory because the browser's pushManager.subscribe() method strictly requires the applicationServerKey to be a raw binary byte array
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  // Calculate the missing padding characters ('=') needed to make the Base64 string length a multiple of 4
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);

  // Restore standard Base64 characters by appending the padding and converting URL-Safe characters:
  // '-' goes back to '+' and '_' goes back to '/'
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  // Decode the standard Base64 string into a raw, non-encoded string where each character represents a byte
  const rawData = atob(base64);

  // Allocate a fixed-size chunk of memory (a binary buffer) matching the exact byte length of the decoded data
  const buffer = new ArrayBuffer(rawData.length);

  // Create an 8-bit unsigned integer view (Uint8Array) to read/write numeric values (0-255) into the allocated buffer
  const view = new Uint8Array(buffer);

  // Loop through every character of the decoded raw data string
  for (let i = 0; i < rawData.length; i++) {
    // Extract the character's numerical byte value (ASCII/Unicode code) and store it in the corresponding array index
    view[i] = rawData.charCodeAt(i);
  }

  // Return the populated binary byte array, now fully compatible with the browser's Push API
  return view;
}

export async function subscribeToPush(uid:string): Promise<void> {

    //check browser support
    if(!('serviceWorker' in navigator) || !('PushManager' in window)){
        console.warn('Push notification not supported');
        return;
    }

    //register service worker
    const registration = await navigator.serviceWorker.ready;
    console.log('service worker ready:', registration);

    //request the permission to send notification
    const permission = await Notification.requestPermission();
    console.log('permesso notifiche:', permission);

    if(permission !== 'granted'){
        console.warn('Notifications permission denied');
        return;
    }

    //subscribe to push service
    try{

        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY)
        });
    
        //save the subscription on firestore
        await updateDoc(doc(db, 'users', uid), {
            pushSubscription: subscription.toJSON(),
        })
        
    } catch(e) {
        console.error('errore subscription:', e);
    }

}

export async function unsubscribeFromPush(uid:string): Promise<void> {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) { return; }

    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
        await subscription.unsubscribe();
    }

    await updateDoc(doc(db,'users', uid), {
        pushSubscription: null,
    })

}