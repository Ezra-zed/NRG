/** Return only the user fields allowed in API responses. */
export const publicUser = (user) => {
  if (!user) return null;
  return {
    id: user.id || user._id?.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
  };
};