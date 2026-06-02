// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCnf_3HP2DjEThmx4V-Qn_mmQhPSCSf3Ig",
  authDomain: "zero-food-wastage-d35e5.firebaseapp.com",
  projectId: "zero-food-wastage-d35e5",
  storageBucket: "zero-food-wastage-d35e5.firebasestorage.app",
  messagingSenderId: "1068420443953",
  appId: "1:1068420443953:web:7059c37cccb7d4e8b34a10",
  measurementId: "G-3H9H9203WF"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const auth = getAuth(app);