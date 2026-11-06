// How a person is named in the interface: their chosen name, or the start of their email.
export function displayName(user) {
  if (user?.display_name) return user.display_name;
  if (user?.email) return user.email.split("@")[0];
  return user?.phone || "You";
}

export function firstName(user) {
  if (user?.display_name) return user.display_name.trim().split(/\s+/)[0];
  return null;
}

export function initialOf(user) {
  return displayName(user).trim().charAt(0).toUpperCase() || "Y";
}
