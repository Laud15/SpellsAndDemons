import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    updateProfile,
    sendPasswordResetEmail,
} from 'firebase/auth';

import {  doc, setDoc, getDoc, writeBatch, updateDoc } from 'firebase/firestore';
import { auth, db } from './clientSDK';
import { unsubscribeFromPush } from './notification'


export async function register(email: string, password: string, username: string) {

    //check if the username is already in use
    const usernameRef = doc(db, "usernames", username.toLocaleLowerCase());
    const snap = await getDoc(usernameRef);
    
    if(snap.exists()){
       throw { code: 'auth/username-already-in-use'}
    }

    //create user
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    //atomic write operation
    const batch = writeBatch(db);

    //reserve the username
    batch.set(usernameRef, { uid: uid });

    //create user profile
    const userDocRef = doc(db, "users", uid);
    batch.set(userDocRef, {
        uid: uid,
        username: username,
        email: email,
        score: 0,
        friends: [],
        pushSubscription: null,
        status: 'free',  
        createdAt: new Date()
        });

    await batch.commit();
}

export async function setUserStatus(uid: string, status: 'offline' | 'free' | 'busy') {
    await updateDoc(doc(db, 'users', uid), { status });
}

export async function  login(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    await setUserStatus(cred.user.uid, 'free');
}

export async function logout(uid: string){
    await setUserStatus(uid, 'offline'); 
    await unsubscribeFromPush(uid);
    await signOut(auth);
}

export async function resetPassword(email: string) {
    await sendPasswordResetEmail(auth, email);
}

