
<script lang="ts">

/*
onMount registers two permanent listeners, then exits.

onAuthStateChanged (Firebase Auth):
  called automatically whenever auth state changes (page load, login, logout, token refresh)
  user != null (sign in) → save firebase user in appUser, open a Firestore listener on his document
  user == null (not sign in) → clear appUser from store (set appUser = null)
  either way  → set authLoading = false so route guards can redirect

onSnapshot (Firestore):
  called automatically whenever the user's document changes
  updates appUser in the store with the latest data
*/
 
    import { onMount } from 'svelte';
    import { onAuthStateChanged } from 'firebase/auth';
    import { doc, onSnapshot } from 'firebase/firestore';
    import { auth, db } from '$lib/firebase/clientSDK';
    import { authStore } from '$lib/stores/auth.svelte';
    import type { AppUser } from '$lib/types';
    import { subscribeToPush } from '$lib/firebase/notification';
    import '$lib/styles/global.css'

    let { children } = $props();

    onMount(() =>{ 
       
        if ('serviceWorker' in navigator) { // Check whether the browser supports Service Workers
            import('virtual:pwa-register') // Dynamically import the PWA registration helper provided by vite-plugin-pwa
                .then(({ registerSW }) => { // Extract the Service Worker registration function
                    registerSW({  // Register the Service Worker
                        immediate: true,  // Register and activate the Service Worker immediately
                        onRegistered(r: any) { // Called when the Service Worker is successfully registered
                            console.log('Service Worker successfully registered:', r);
                        },
                        onRegisterError(error: any) { // Called if an error occurs during registration
                            console.error('Error in Service Worker Registration:', error);
                        }
                    });
                })
                .catch((err) => console.error('Unable to import virtual:pwa-register', err));   // Handle errors that occur while importing the registration module
        }

        let unsubscribeSnapshot: (()=>void) | null = null;

        const unsubscribeAuth = onAuthStateChanged(auth, (user)=>{
            authStore.setFirebaseUser(user);

            if(unsubscribeSnapshot){//if unsub.snap is != null this means that is running
                unsubscribeSnapshot(); //call it for close
                unsubscribeSnapshot = null; //set it to null
            }

            //if the user is logged in (user != null)
            if(user){

                const userRef = doc(db, 'users', user.uid)//find his doc on firestore
                unsubscribeSnapshot = onSnapshot(userRef, (snap)=>{//staying listening on doc
                    if(snap.exists()){//if a change is detected
                        authStore.setAppUser(snap.data() as AppUser)//set the app user with the data of the firebase user
                    }
                }); 

                subscribeToPush(user.uid);
                
            } else {
                authStore.setAppUser(null);
            }

            authStore.setAuthLoading(false);
        });

        //close the listeners, "unsubscribe" from the listener
        return () =>{
            unsubscribeAuth();
            if(unsubscribeSnapshot){ unsubscribeSnapshot(); }
        }
    });

</script>

{@render children()}


