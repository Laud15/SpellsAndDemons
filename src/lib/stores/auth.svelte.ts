
import type { User } from 'firebase/auth';
import type { AppUser } from '$lib/types';

let firebaseUser = $state<User | null>(null);
let appUser = $state<AppUser | null>(null);
let authLoading = $state(true);

export const authStore = {

  //getter
  get firebaseUser() { return firebaseUser; },
  get appUser() { return appUser; },
  get authLoading() { return authLoading; },

  //setter
  setFirebaseUser(user: User | null) { firebaseUser = user; },
  setAppUser(user: AppUser | null) { appUser = user; },
  setAuthLoading(val: boolean) { authLoading = val; }
  
};