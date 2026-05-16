import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCOrsXU3AUaE9cRvGLLJ2R-lCSkK_KSu1Q",
  authDomain: "fund-management-16976.firebaseapp.com",
  projectId: "fund-management-16976",
  storageBucket: "fund-management-16976.firebasestorage.app",
  messagingSenderId: "434094400472",
  appId: "1:434094400472:web:7228b582d2056f8d0b48ad",
  measurementId: "G-CSGSPCGW57"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

let firebaseSessionPromise;

export function ensureFirebaseSession() {
  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser);
  }

  if (!firebaseSessionPromise) {
    firebaseSessionPromise = new Promise((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          if (user) {
            unsubscribe();
            resolve(user);
          }
        },
        (error) => {
          unsubscribe();
          firebaseSessionPromise = null;
          reject(error);
        }
      );

      signInAnonymously(auth).catch((error) => {
        unsubscribe();
        firebaseSessionPromise = null;
        reject(error);
      });
    });
  }

  return firebaseSessionPromise;
}
