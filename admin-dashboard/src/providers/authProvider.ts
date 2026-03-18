export const authProvider = {
  login: async ({ secret }: { secret: string }) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const response = await fetch(`${API_URL}/admin/config`, {
        headers: {
          'Authorization': `Bearer ${secret}`
        }
      });
      if (response.ok) {
        localStorage.setItem("admin_secret", secret);
        return { success: true, redirectTo: "/" };
      }
      return { success: false, error: { message: "Fallo de Autenticación", name: "Invalid Secret" } };
    } catch {
      return { success: false, error: { message: "Servidor inalcanzable", name: "Network Error" } };
    }
  },
  logout: async () => {
    localStorage.removeItem("admin_secret");
    return { success: true, redirectTo: "/login" };
  },
  check: async () => {
    const token = localStorage.getItem("admin_secret");
    if (token) {
      return { authenticated: true };
    }
    return { authenticated: false, error: { message: "No autorizado", name: "Unauthorized" }, logout: true, redirectTo: "/login" };
  },
  getPermissions: async () => null,
  getIdentity: async () => {
    const token = localStorage.getItem("admin_secret");
    if (token) return { id: 1, name: "System Admin" };
    return null;
  },
  onError: async (error: any) => {
    console.error(error);
    return { error };
  },
};
