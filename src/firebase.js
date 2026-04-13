import { initializeApp } from "firebase/app";
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
export const db = getFirestore(app);
