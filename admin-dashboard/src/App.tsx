import { Refine, Authenticated } from "@refinedev/core";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { BrowserRouter, Route, Routes, Navigate, Outlet } from "react-router-dom";
import routerBindings, { CatchAllNavigate, NavigateToResource } from "@refinedev/react-router-v6";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

import { authProvider } from "./providers/authProvider";
import { ThemedLayout } from "./components/layout";
import { Dashboard } from "./pages/dashboard";
import { Login } from "./pages/login";

// Tailwind global CSS
import "./index.css";

function App() {
  return (
    <BrowserRouter>
      <MantineProvider forceColorScheme="dark" theme={{
        fontFamily: 'Space Grotesk, sans-serif'
      }}>
        <Notifications position="top-right" />
        <Refine
          routerProvider={routerBindings}
          authProvider={authProvider}
          resources={[
            {
              name: "dashboard",
              list: "/dashboard",
              meta: {
                label: "Módulo Juez IA"
              }
            }
          ]}
          options={{
            syncWithLocation: true,
            warnWhenUnsavedChanges: true,
          }}
        >
          <Routes>
            <Route
              element={
                <Authenticated key="authenticated-routes" fallback={<CatchAllNavigate to="/login" />}>
                  <ThemedLayout>
                    <Outlet />
                  </ThemedLayout>
                </Authenticated>
              }
            >
              <Route index element={<NavigateToResource resource="dashboard" />} />
              <Route path="/dashboard" element={<Dashboard />} />
            </Route>

            <Route
              element={
                <Authenticated key="auth-pages" fallback={<Outlet />}>
                  <NavigateToResource />
                </Authenticated>
              }
            >
              <Route path="/login" element={<Login />} />
            </Route>
            
            <Route
              element={
                <Authenticated key="catch-all" fallback={<CatchAllNavigate to="/login" />}>
                  <ThemedLayout>
                    <Outlet />
                  </ThemedLayout>
                </Authenticated>
              }
            >
              <Route path="*" element={<Navigate to="/" />} />
            </Route>
          </Routes>
        </Refine>
      </MantineProvider>
    </BrowserRouter>
  );
}

export default App;
