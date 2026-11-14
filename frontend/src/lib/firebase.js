// Google and phone sign-in through Firebase. The library is loaded only when
// someone taps one of these buttons, so it never slows the first page load.
async function load(config) {
  const [{ initializeApp, getApps }, authModule] = await Promise.all([import("@firebase/app"), import("@firebase/auth")]);
  const app = getApps()[0] ?? initializeApp(config);
  return { auth: authModule.getAuth(app), authModule };
}

// Opens Google's window and returns a Firebase ID token for the API.
export async function googleIdToken(config) {
  const { auth, authModule } = await load(config);
  const result = await authModule.signInWithPopup(auth, new authModule.GoogleAuthProvider());
  return result.user.getIdToken();
}

// Sends a text message with a code. The returned confirm(code) gives a Firebase ID token.
// containerId names an element for the invisible reCAPTCHA Firebase uses against abuse.
export async function startPhoneSignIn(config, phone, containerId) {
  const { auth, authModule } = await load(config);
  window.gurucoolRecaptcha?.clear?.();
  const verifier = new authModule.RecaptchaVerifier(auth, containerId, { size: "invisible" });
  window.gurucoolRecaptcha = verifier;
  const confirmation = await authModule.signInWithPhoneNumber(auth, phone, verifier);
  return {
    async confirm(code) {
      const result = await confirmation.confirm(code);
      return result.user.getIdToken();
    },
  };
}
