import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    updateProfile
} from 'firebase/auth';

import { doc, setDoc, getDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from './clientSDK';


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
            createdAt: new Date()
        });

    await batch.commit();
}

export async function  login(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password)
}

export async function logout(){
    await signOut(auth);
}

