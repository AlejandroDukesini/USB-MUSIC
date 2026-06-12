import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import PlayerBar from "./PlayerBar.jsx";
import Toast from "./Toast.jsx";

export default function Layout() {
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet />
        </main>
      </div>
      <PlayerBar />
      <Toast />
    </div>
  );
}
